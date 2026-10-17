import { NotFoundError, RejectedError, ValidationError } from "../../../shared/domain-errors";
import { FakeGateway, FakeRepository } from "../../milestones/application/testing";
import type { LinePaymentResult } from "../../milestones/ports/payment-gateway";
import { FakeDirectory } from "../../negotiations/application/testing";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { PROJECT_STATUS, type ProjectStatus, type Viewer } from "../../projects/application/project";
import { FakeProjectRepository } from "../../projects/application/testing";
import { simulate } from "../../simulation/application/motor";
import { PRESETS } from "../../simulation/application/presets";
import { FakeSimulationRunRepository } from "../../simulation/application/testing";
import { ContractsUseCases, type PolicyInput, type PurchaseContractInput } from "./contracts.use-cases";
import { CLAIM_STATUS, CLAIM_TRIGGER, PREMIUM_STATUS } from "./insurance";
import { PRICE_TYPE } from "./purchase-contract";
import { ADMIN, BUYER_USER, FakeContractsStore, FakeIndemnityInflow, FakePremiumFunding, FakeWalletDirectory, FIDU, INVESTOR_A, OWNER } from "./testing";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const otherProducer: Viewer = { id: "u-other", role: "seller" };
const now = new Date("2026-10-17T12:00:00Z");
const meta = { ip: "10.0.0.1", userAgent: "vitest" };
const users = [
  { id: OWNER.id, email: "productor@agro.dev", name: "Pedro Productor", role: OWNER.role },
  { id: BUYER_USER.id, email: "comprador@agro.dev", name: "Comercializadora Andina", role: BUYER_USER.role },
  { id: INVESTOR_A.id, email: "ana@agro.dev", name: "Ana Inversionista", role: INVESTOR_A.role },
  { id: FIDU.id, email: "fidu@agro.dev", name: "Fiduciaria", role: FIDU.role },
];

const purchaseInput = (overrides: Partial<PurchaseContractInput> = {}): PurchaseContractInput => ({
  price: { type: PRICE_TYPE.FIXED, pricePerUnit: 130_000 },
  quantity: 85_000,
  unit: "kg",
  currency: "COP",
  buyerEmail: "comprador@agro.dev",
  buyerWalletAddress: "https://wallet.test/comprador",
  ...overrides,
});

// Input mode (no simulation): 10 ha × 1.000 kg/ha × 1.000 $/kg, Y_gat 700 kg/ha; gross premium 1.000.000, net 150.000 pesos.
const policyInput = (overrides: Partial<PolicyInput> = {}): PolicyInput => ({
  insurerName: "Aseguradora Demo",
  insurerWalletAddress: "https://wallet.test/aseguradora",
  grossPremium: 100_000_000,
  subsidyPct: 85,
  thresholdPct: 70,
  deductiblePct: 10,
  hectares: 10,
  expectedYieldKgPerHa: 1_000,
  insuredPricePerKg: 100_000,
  indexTrigger: null,
  indexExit: null,
  ...overrides,
});

async function setup({ gateway = new FakeGateway((r) => ({ status: "en_cola", reference: `REF-${r.lineId}` })), premium = new FakePremiumFunding(), inflow = new FakeIndemnityInflow() } = {}) {
  const milestones = new FakeRepository(new Map());
  const projects = new FakeProjectRepository(milestones);
  const project = await new CreateProjectUseCase(projects, wallets).execute(OWNER, {
    title: "Tomate bajo invernadero",
    description: "Ciclo de 120 días",
    productionType: "OTRO",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-01",
    milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100_000, laborBudget: 200_000, requirements: [] }],
  });
  const store = new FakeContractsStore(projects);
  const runs = new FakeSimulationRunRepository();
  const useCases = new ContractsUseCases(projects, milestones, store, runs, new FakeDirectory(users), new FakeWalletDirectory(), gateway, premium, inflow, { now: () => now });
  const fund = async (custodyBalance: number, status: ProjectStatus = PROJECT_STATUS.FUNDED_IN_CUSTODY) => {
    const stored = await projects.findById(project.id);
    if (!stored) throw new Error("no project");
    stored.custodyBalance = custodyBalance;
    stored.currentStatus = status;
  };
  return { projects, project, store, runs, gateway, premium, inflow, useCases, fund };
}

describe("ContractsUseCases · purchase contract (RF-04)", () => {
  it("stores the owner's contract with the buyer found by email and the wallet's asset; anyone who sees the project reads it", async () => {
    const { useCases, project } = await setup();
    const saved = await useCases.putPurchaseContract(project.id, OWNER, purchaseInput());
    expect(saved).toEqual({
      projectId: project.id,
      price: { type: "fixed", pricePerUnit: 130_000 },
      quantity: 85_000,
      unit: "kg",
      currency: "COP",
      buyerUserId: BUYER_USER.id,
      buyerWalletAddress: "https://wallet.test/comprador",
      buyerWalletAssetCode: "COP",
      buyerWalletAssetScale: 2,
      updatedBy: OWNER.id,
      updatedAt: now,
    });
    expect(await useCases.getPurchaseContract(project.id, FIDU)).toEqual(saved);
    expect(await useCases.getPurchaseContract(project.id, BUYER_USER)).toEqual(saved);
  });

  it("accepts a formula price and a buyer who is an investor", async () => {
    const { useCases, project } = await setup();
    const price = { type: PRICE_TYPE.FORMULA, floorPerUnit: 100_000, ceilingPerUnit: 150_000, reference: "precio SIPSA Corabastos" } as const;
    const saved = await useCases.putPurchaseContract(project.id, ADMIN, purchaseInput({ price, buyerEmail: "ana@agro.dev" }));
    expect(saved).toMatchObject({ price, buyerUserId: INVESTOR_A.id, updatedBy: ADMIN.id });
  });

  it("refuses an unknown buyer and a wallet that does not resolve, by field", async () => {
    const { useCases, project } = await setup();
    const error = await useCases.putPurchaseContract(project.id, OWNER, purchaseInput({ buyerEmail: "nadie@agro.dev", buyerWalletAddress: "https://wallet.test/missing" })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toEqual({
      buyer_email: ["No encontramos un comprador registrado con ese correo."],
      buyer_wallet_address: ["No pudimos validar esa wallet: revisa la dirección."],
    });
  });

  it("is fixed once the project is published, and another producer's project is a 404", async () => {
    const { useCases, project, fund } = await setup();
    await expect(useCases.putPurchaseContract(project.id, otherProducer, purchaseInput())).rejects.toBeInstanceOf(NotFoundError);
    await fund(0, PROJECT_STATUS.FUNDING_IN_PROGRESS);
    await expect(useCases.putPurchaseContract(project.id, OWNER, purchaseInput())).rejects.toThrow(new RejectedError("El contrato de compra se fija antes de publicar el proyecto."));
  });

  it("answers 404 while there is none", async () => {
    const { useCases, project } = await setup();
    await expect(useCases.getPurchaseContract(project.id, OWNER)).rejects.toBeInstanceOf(NotFoundError);
    expect(await useCases.hasPurchaseContract(project.id)).toBe(false);
  });
});

describe("ContractsUseCases · insurance policy (RF-05)", () => {
  it("without a simulation, takes the terms from the input and nets the ISA subsidy; the beneficiary is the patrimonio autónomo", async () => {
    const { useCases, project } = await setup();
    const policy = await useCases.putPolicy(project.id, OWNER, policyInput({ indexTrigger: 100, indexExit: 50 }));
    expect(policy).toMatchObject({
      insurerName: "Aseguradora Demo",
      beneficiary: "PATRIMONIO_AUTONOMO",
      source: "input",
      simulationRunId: null,
      premiumPayment: null,
      terms: { grossPremium: 100_000_000, subsidyPct: 85, netPremium: 15_000_000, thresholdPct: 70, indexTrigger: 100, indexExit: 50 },
    });
    expect(await useCases.getPolicy(project.id, INVESTOR_A)).toEqual(policy);
  });

  it("with a simulation, the latest run's premium and terms win (net premium = the sheet's)", async () => {
    const { useCases, project, runs } = await setup();
    const inputs = { ...PRESETS.P2.inputs, runs: 200 };
    const sheet = simulate(inputs);
    await runs.save({ id: "run-1", projectId: project.id, preset: "P2", inputs, seed: inputs.seed, motorVersion: sheet.motorVersion, sheet, createdBy: OWNER.id, createdAt: now });
    const policy = await useCases.putPolicy(project.id, FIDU, policyInput({ grossPremium: null, hectares: null }));
    expect(policy).toMatchObject({ source: "simulation", simulationRunId: "run-1", terms: { netPremium: sheet.capital.insurancePremium, hectares: 1, subsidyPct: 85 } });
  });

  it("without a simulation, the premium and the insured terms are required", async () => {
    const { useCases, project } = await setup();
    const error = await useCases.putPolicy(project.id, OWNER, policyInput({ grossPremium: null, hectares: null })).catch((e: unknown) => e);
    expect((error as ValidationError).fieldErrors).toEqual({
      premium: ["Ingresa la prima o simula el proyecto."],
      hectares: ["Ingresa las hectáreas aseguradas o simula el proyecto."],
    });
  });

  it("refuses an insurer wallet that does not resolve", async () => {
    const { useCases, project } = await setup();
    const error = await useCases.putPolicy(project.id, OWNER, policyInput({ insurerWalletAddress: "https://wallet.test/missing" })).catch((e: unknown) => e);
    expect((error as ValidationError).fieldErrors).toEqual({ insurer_wallet_address: ["No pudimos validar esa wallet: revisa la dirección."] });
  });
});

describe("ContractsUseCases · premium from custody (RF-14)", () => {
  it("refuses before activation (captación completa) and without a policy", async () => {
    const { useCases, project, fund } = await setup();
    await expect(useCases.payPremium(project.id, FIDU)).rejects.toThrow(new RejectedError("Registra la póliza antes de pagar la prima."));
    await useCases.putPolicy(project.id, OWNER, policyInput());
    await fund(100_000_000, PROJECT_STATUS.FUNDING_IN_PROGRESS);
    await expect(useCases.payPremium(project.id, FIDU)).rejects.toThrow(/al activar el proyecto/);
  });

  it("simulated mode: pays the net premium from custody to the insurer under the premium grant, books a DEBIT and revokes the grant", async () => {
    const { useCases, project, fund, gateway, store, projects, premium } = await setup();
    await useCases.putPolicy(project.id, OWNER, policyInput());
    await fund(100_000_000);
    const policy = await useCases.payPremium(project.id, FIDU);
    expect(gateway.requests).toEqual([
      { milestoneId: project.id, lineId: expect.any(String), walletAddress: "https://wallet.test/aseguradora", amount: 15_000_000, currency: "COP", assetScale: 2, grantScope: "premium" },
    ]);
    expect(policy.premiumPayment).toMatchObject({ amount: 15_000_000, status: PREMIUM_STATUS.COMPLETED, reference: expect.stringMatching(/^REF-/), requestedBy: FIDU.id, completedAt: now });
    expect(store.ledger).toEqual([{ type: "DEBIT", category: "PREMIUM", projectId: project.id, amount: 15_000_000, reference: policy.premiumPayment?.reference }]);
    expect((await projects.findById(project.id))?.custodyBalance).toBe(85_000_000);
    expect(premium.revoked).toEqual([project.id]);
    // Paid once: asking again answers the paid policy and moves nothing.
    expect((await useCases.payPremium(project.id, FIDU)).premiumPayment?.status).toBe(PREMIUM_STATUS.COMPLETED);
    expect(gateway.requests).toHaveLength(1);
    await expect(useCases.putPolicy(project.id, OWNER, policyInput())).rejects.toThrow(/prima ya se pagó/);
  });

  it("open-payments mode: the fiduciaria approves the premium grant (capped at the net premium) before the premium leaves", async () => {
    const premium = new FakePremiumFunding(true);
    const { useCases, project, fund } = await setup({ premium });
    await useCases.putPolicy(project.id, OWNER, policyInput());
    await fund(100_000_000);
    await expect(useCases.payPremium(project.id, FIDU)).rejects.toThrow(/grant de la prima/);
    expect(await useCases.startPremiumGrant(project.id, FIDU)).toEqual({ redirectUrl: `https://wallet.test/consent/premium/${project.id}` });
    expect(premium.started).toEqual([{ projectId: project.id, amount: 15_000_000, currency: "COP", assetScale: 2 }]);
    await useCases.completePremiumGrant(project.id, { interactRef: "ref", hash: "h" });
    expect((await useCases.payPremium(project.id, FIDU)).premiumPayment?.status).toBe(PREMIUM_STATUS.COMPLETED);
  });

  it("simulated mode has no premium grant to approve", async () => {
    const { useCases, project, fund } = await setup();
    await useCases.putPolicy(project.id, OWNER, policyInput());
    await fund(100_000_000);
    expect(await useCases.startPremiumGrant(project.id, FIDU)).toBeNull();
  });

  it("refuses when custody holds less than the net premium", async () => {
    const { useCases, project, fund, gateway } = await setup();
    await useCases.putPolicy(project.id, OWNER, policyInput());
    await fund(1_000);
    await expect(useCases.payPremium(project.id, FIDU)).rejects.toThrow(new RejectedError("La custodia no tiene saldo para pagar la prima."));
    expect(gateway.requests).toEqual([]);
  });

  it("a failed payment can be retried; one in flight is synced on the next call", async () => {
    let answer: LinePaymentResult = { status: "fallido", reference: null };
    let checked: LinePaymentResult["status"] = "en_cola";
    const gateway = new FakeGateway(
      () => answer,
      (reference) => ({ status: checked, reference }),
    );
    const { useCases, project, fund, store } = await setup({ gateway });
    await useCases.putPolicy(project.id, OWNER, policyInput());
    await fund(100_000_000);
    expect((await useCases.payPremium(project.id, ADMIN)).premiumPayment?.status).toBe(PREMIUM_STATUS.FAILED);
    answer = { status: "en_cola", reference: "REF-2" };
    expect((await useCases.payPremium(project.id, ADMIN)).premiumPayment).toMatchObject({ status: PREMIUM_STATUS.EXECUTING, reference: "REF-2" });
    expect(store.ledger).toEqual([]);
    checked = "completado";
    expect((await useCases.payPremium(project.id, ADMIN)).premiumPayment?.status).toBe(PREMIUM_STATUS.COMPLETED);
    expect(gateway.requests).toHaveLength(2);
    expect(store.ledger).toHaveLength(1);
  });
});

describe("ContractsUseCases · tri/quad-party contract (RF-09)", () => {
  async function withContract() {
    const ctx = await setup();
    await ctx.useCases.putPurchaseContract(ctx.project.id, OWNER, purchaseInput());
    ctx.store.investors = [{ userId: INVESTOR_A.id, capital: 3_000_000 }];
    return ctx;
  }

  it("needs the purchase contract first", async () => {
    const { useCases, project } = await setup();
    await expect(useCases.generateContract(project.id, OWNER)).rejects.toThrow(new RejectedError("Registra el contrato de compra antes de generar el contrato."));
  });

  it("generates version 1 with the captured investors, fiduciaria, producer and buyer; unchanged terms keep that version", async () => {
    const { useCases, project } = await withContract();
    const doc = await useCases.generateContract(project.id, OWNER);
    expect(doc).toMatchObject({ projectId: project.id, version: 1, hash: expect.stringMatching(/^[0-9a-f]{64}$/), signatures: [] });
    expect(doc.parties).toEqual([
      { role: "investor", userId: INVESTOR_A.id, name: "Ana Inversionista" },
      { role: "fiduciaria", userId: null, name: "Patrimonio autónomo (fiduciaria)" },
      { role: "producer", userId: OWNER.id, name: "Pedro Productor" },
      { role: "buyer", userId: BUYER_USER.id, name: "Comercializadora Andina" },
    ]);
    expect(doc.body).toContain(project.projectCode);
    expect((await useCases.generateContract(project.id, FIDU)).id).toBe(doc.id);
    expect(await useCases.getContract(project.id, BUYER_USER)).toEqual(doc);
  });

  it("signing by every party moves a DRAFT project to CONTRACT_SIGNED", async () => {
    const { useCases, project, projects } = await withContract();
    const doc = await useCases.generateContract(project.id, OWNER);
    for (const signer of [OWNER, FIDU, INVESTOR_A]) await useCases.sign(doc.id, signer, meta);
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.DRAFT);
    const signed = await useCases.sign(doc.id, BUYER_USER, meta);
    expect(signed.signatures.map((s) => s.partyRole)).toEqual(["producer", "fiduciaria", "investor", "buyer"]);
    expect(signed.signatures[3]).toEqual({ partyRole: "buyer", userId: BUYER_USER.id, signedAt: now, ip: "10.0.0.1", userAgent: "vitest", contractHash: doc.hash });
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.CONTRACT_SIGNED);
  });

  it("never regresses a project past the contract (funded stays funded)", async () => {
    const { useCases, project, projects, fund } = await withContract();
    const doc = await useCases.generateContract(project.id, OWNER);
    await fund(1_000, PROJECT_STATUS.FUNDED_IN_CUSTODY);
    for (const signer of [OWNER, FIDU, INVESTOR_A, BUYER_USER]) await useCases.sign(doc.id, signer, meta);
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.FUNDED_IN_CUSTODY);
  });

  it("refuses signing a superseded version, a stranger, and a 404 for an unknown contract", async () => {
    const { useCases, project, store } = await withContract();
    const first = await useCases.generateContract(project.id, OWNER);
    store.investors = [];
    const second = await useCases.generateContract(project.id, OWNER);
    expect(second.version).toBe(2);
    await expect(useCases.sign(first.id, OWNER, meta)).rejects.toThrow(/versión más reciente/);
    await expect(useCases.sign(second.id, otherProducer, meta)).rejects.toThrow(new RejectedError("No eres parte de este contrato."));
    await expect(useCases.sign("nope", OWNER, meta)).rejects.toBeInstanceOf(NotFoundError);
    await expect(useCases.getContract(project.id, otherProducer)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("ContractsUseCases · indemnity into custody (RF-25)", () => {
  async function insured(inflow = new FakeIndemnityInflow()) {
    const ctx = await setup({ inflow });
    await ctx.useCases.putPolicy(ctx.project.id, OWNER, policyInput({ indexTrigger: 100, indexExit: 50 }));
    await ctx.fund(100_000_000);
    await ctx.useCases.payPremium(ctx.project.id, FIDU);
    return ctx;
  }

  it("needs the premium paid: an unpaid policy is not in force", async () => {
    const { useCases, project } = await setup();
    await useCases.putPolicy(project.id, OWNER, policyInput());
    await expect(useCases.fileClaim(project.id, FIDU, { trigger: CLAIM_TRIGGER.YIELD, observedValue: 500, evidence: "Acta" })).rejects.toThrow(/no está vigente/);
  });

  it("simulated mode: files a yield claim with the A6 amount, then confirming credits custody", async () => {
    const { useCases, project, store, projects } = await insured();
    const claim = await useCases.fileClaim(project.id, FIDU, { trigger: CLAIM_TRIGGER.YIELD, observedValue: 500, evidence: "Certificado del verificador" });
    expect(claim).toMatchObject({ projectId: project.id, trigger: "yield", observedValue: 500, amount: 130_000_000, status: CLAIM_STATUS.PENDING, incomingPaymentUrl: null, createdBy: FIDU.id });
    const confirmed = await useCases.confirmClaim(project.id, claim.id, ADMIN);
    expect(confirmed).toMatchObject({ status: CLAIM_STATUS.CONFIRMED, confirmedBy: ADMIN.id, confirmedAt: now });
    expect(store.ledger.at(-1)).toEqual({ type: "CREDIT", category: "INDEMNITY", projectId: project.id, amount: 130_000_000, reference: null });
    expect((await projects.findById(project.id))?.custodyBalance).toBe(85_000_000 + 130_000_000);
    expect(await useCases.listClaims(project.id, OWNER)).toEqual([confirmed]);
    // Idempotent: confirming again books nothing more.
    await useCases.confirmClaim(project.id, claim.id, ADMIN);
    expect(store.ledger.filter((e) => e.category === "INDEMNITY")).toHaveLength(1);
  });

  it("open-payments mode: exposes the incoming payment on custody and confirms only once the insurer paid it", async () => {
    const inflow = new FakeIndemnityInflow("https://rs.custody.test/incoming-payments/ind-1");
    const { useCases, project } = await insured(inflow);
    const claim = await useCases.fileClaim(project.id, FIDU, { trigger: CLAIM_TRIGGER.INDEX, observedValue: 75, evidence: "Índice IDEAM" });
    expect(claim).toMatchObject({ amount: 350_000_000, incomingPaymentUrl: "https://rs.custody.test/incoming-payments/ind-1" });
    expect(inflow.orders).toEqual([{ claimId: claim.id, projectId: project.id, amount: 350_000_000, currency: "COP", assetScale: 2 }]);
    inflow.paid = 100;
    await expect(useCases.confirmClaim(project.id, claim.id, FIDU)).rejects.toThrow(/aún no paga/);
    inflow.paid = 350_000_000;
    expect((await useCases.confirmClaim(project.id, claim.id, FIDU)).status).toBe(CLAIM_STATUS.CONFIRMED);
  });

  it("refuses a second claim and a threshold the observation does not cross", async () => {
    const { useCases, project } = await insured();
    await expect(useCases.fileClaim(project.id, FIDU, { trigger: CLAIM_TRIGGER.YIELD, observedValue: 900, evidence: "x" })).rejects.toThrow(/no cae del umbral/);
    await useCases.fileClaim(project.id, FIDU, { trigger: CLAIM_TRIGGER.YIELD, observedValue: 500, evidence: "x" });
    await expect(useCases.fileClaim(project.id, FIDU, { trigger: CLAIM_TRIGGER.YIELD, observedValue: 400, evidence: "x" })).rejects.toThrow(/ya tiene una reclamación/);
    await expect(useCases.confirmClaim(project.id, "nope", FIDU)).rejects.toBeInstanceOf(NotFoundError);
  });
});
