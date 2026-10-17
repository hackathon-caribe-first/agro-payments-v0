import { DomainError, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import { FakeGateway, FakeRepository, ThrowingGateway } from "../../milestones/application/testing";
import { applyLineResult, review, submitEvidence } from "../../milestones/application/milestone";
import type { PaymentGateway } from "../../milestones/ports/payment-gateway";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { PROJECT_STATUS, type Viewer } from "../../projects/application/project";
import { FakeProjectRepository } from "../../projects/application/testing";
import { PAYOUT_STATUS, SETTLEMENT_STATUS } from "./settlement";
import { SettlementUseCases } from "./settlement.use-cases";
import { CapturedInvestors } from "../ports/captured-investors";
import type { InvestorPosition } from "./settlement";
import type { LiquidationFunding } from "../ports/liquidation-funding";
import { SimulatedLiquidationFunding } from "../infrastructure/adapters/simulated-liquidation-funding.adapter";
import { FakeLiquidationFunding, FakeSettlementRepository, sampleTerms } from "./testing";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const owner: Viewer = { id: "u-prod", role: "seller" };
const otherProducer: Viewer = { id: "u-other", role: "seller" };
const admin: Viewer = { id: "u-admin", role: "admin" };
const fidu: Viewer = { id: "u-fidu", role: "fidu" };
const investor: Viewer = { id: "u-inv", role: "investor" };

async function setup(
  gateway: PaymentGateway = new FakeGateway((r) => ({ status: "en_cola", reference: `REF-${r.lineId}` })),
  // Simulated mode by default: payouts need no liquidation grant there.
  liquidation: LiquidationFunding = new SimulatedLiquidationFunding(),
) {
  const milestones = new FakeRepository(new Map());
  const projects = new FakeProjectRepository(milestones);
  const project = await new CreateProjectUseCase(projects, wallets).execute(owner, {
    title: "Tomate bajo invernadero",
    description: "Ciclo de 120 días",
    productionType: "OTRO",
    startDate: "2026-11-01",
    // 120 days: d of the cycle when the request does not send it.
    estimatedEndDate: "2027-03-01",
    milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100, laborBudget: 200, requirements: [] }],
  });
  // RF-24: the cascade runs once the buyer confirmed reception of the harvest.
  await projects.updateStatus(project.id, PROJECT_STATUS.DELIVERED_TO_BUYER);
  const settlements = new FakeSettlementRepository();
  return {
    projects,
    project,
    milestones,
    settlements,
    gateway,
    liquidation,
    useCases: new SettlementUseCases(projects, settlements, gateway, wallets, liquidation, undefined, milestones),
  };
}

describe("SettlementUseCases.preview", () => {
  it("computes the plan without storing anything, paying producer and platform to the project wallets", async () => {
    const { useCases, project, settlements } = await setup();
    const preview = await useCases.preview(project.id, admin, { ...sampleTerms(), days: 365 });
    expect(preview.plan.totals.map((t) => t.amount)).toEqual([10_000_000, 84_600_000, 56_400_000, 37_400_000, 11_600_000]);
    expect(preview.payouts.find((p) => p.id === "producer")?.walletAddress).toBe(wallets.producer);
    expect(preview.payouts.find((p) => p.id === "platform")?.walletAddress).toBe(wallets.platform);
    expect(await settlements.findByProject(project.id)).toEqual([]);
  });

  it("defaults d to the project's cycle (start to estimated end)", async () => {
    const { useCases, project } = await setup();
    const preview = await useCases.preview(project.id, admin, { ...sampleTerms(), days: null });
    expect(preview.terms.days).toBe(120);
  });

  it("answers 404 for an unknown project", async () => {
    const { useCases } = await setup();
    await expect(useCases.preview("nope", admin, { ...sampleTerms(), days: null })).rejects.toThrow(NotFoundError);
  });

  it("defaults L to what is still in custody (credited balance minus milestone lines paid) when the request omits proceeds", async () => {
    const { useCases, project, projects, milestones } = await setup();
    const stored = await projects.findById(project.id);
    if (stored) stored.custodyBalance = 250_000_000;
    let [m] = await milestones.findByProject(project.id);
    m = review(submitEvidence({ ...m, fundedAt: new Date() }, "Fotos", new Date()), "approved", null, new Date());
    m = applyLineResult(m, m.lines[0].id, { status: "completado", reference: "R" }, new Date());
    await milestones.save(m);
    const preview = await useCases.preview(project.id, admin, { ...sampleTerms(), proceeds: null, days: 365 });
    expect(preview.terms.proceeds).toBe(250_000_000 - m.lines[0].amount);
    const explicit = await useCases.preview(project.id, admin, { ...sampleTerms(), days: 365 });
    expect(explicit.terms.proceeds).toBe(200_000_000);
  });
});

describe("SettlementUseCases create → approve → execute", () => {
  it("creates a draft, approves it and executes every payout through the gateway, closing the project", async () => {
    const { useCases, project, projects, gateway } = await setup();
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    expect(draft).toMatchObject({ status: SETTLEMENT_STATUS.DRAFT, projectId: project.id, createdBy: admin.id });

    const approved = await useCases.approve(draft.id, fidu);
    expect(approved).toMatchObject({ status: SETTLEMENT_STATUS.APPROVED, approvedBy: fidu.id });

    const executed = await useCases.execute(approved.id);
    expect(executed.status).toBe(SETTLEMENT_STATUS.EXECUTED);
    expect(executed.payouts.every((p) => p.status === PAYOUT_STATUS.EXECUTED)).toBe(true);
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.SETTLED_AND_CLOSED);

    const requests = (gateway as FakeGateway).requests;
    expect(requests.map((r) => [r.milestoneId, r.lineId, r.amount, r.currency, r.assetScale, r.fixedDebitAmount])).toEqual([
      [draft.id, "integrator", 10_000_000, "COP", 2, false],
      [draft.id, "investor-inv-cop", 84_600_000, "COP", 2, false],
      [draft.id, "investor-inv-eur", 56_400_000, "COP", 2, true],
      [draft.id, "producer", 37_400_000, "COP", 2, false],
      [draft.id, "platform", 11_600_000, "COP", 2, false],
    ]);
  });

  it("keeps the project in SETTLEMENT_PROCESSING while payouts are in flight, and a second execute syncs them", async () => {
    let settled = false;
    const gateway = new FakeGateway(
      (r) => ({ status: "en_cola", reference: `REF-${r.lineId}` }),
      (reference) => (settled ? { status: "completado", reference } : { status: "en_cola", reference }),
    );
    const { useCases, project, projects } = await setup(gateway);
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    await useCases.approve(draft.id, admin);

    const first = await useCases.execute(draft.id);
    expect(first.status).toBe(SETTLEMENT_STATUS.EXECUTING);
    expect(first.payouts.every((p) => p.status === PAYOUT_STATUS.EXECUTING)).toBe(true);
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.SETTLEMENT_PROCESSING);

    settled = true;
    const second = await useCases.execute(draft.id);
    expect(second.status).toBe(SETTLEMENT_STATUS.EXECUTED);
    expect(gateway.requests).toHaveLength(5);
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.SETTLED_AND_CLOSED);
  });

  it("fails a payout the gateway cannot reach without blocking the others; the settlement ends failed and the project stays in processing", async () => {
    const { useCases, project, projects } = await setup(new ThrowingGateway());
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    await useCases.approve(draft.id, admin);
    const result = await useCases.execute(draft.id);
    expect(result.payouts.every((p) => p.status === PAYOUT_STATUS.FAILED)).toBe(true);
    expect(result.status).toBe(SETTLEMENT_STATUS.FAILED);
    expect((await projects.findById(project.id))?.currentStatus).toBe(PROJECT_STATUS.SETTLEMENT_PROCESSING);
  });

  it("stops on a gateway refusal (DomainError → 409), keeping the payouts already sent and leaving the refused one pending", async () => {
    const gateway = new FakeGateway((r) => {
      if (r.fixedDebitAmount) throw new DomainError("not supported");
      return { status: "en_cola", reference: `REF-${r.lineId}` };
    });
    const { useCases, project, settlements } = await setup(gateway);
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    await useCases.approve(draft.id, admin);
    await expect(useCases.execute(draft.id)).rejects.toThrow(DomainError);
    const stored = await settlements.findById(draft.id);
    expect(stored?.payouts.map((p) => p.status)).toEqual([PAYOUT_STATUS.EXECUTING, PAYOUT_STATUS.EXECUTING, PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PENDING]);
  });

  it("refuses to execute (409) before the buyer confirmed reception of the harvest (DELIVERED_TO_BUYER)", async () => {
    const { useCases, project, projects, gateway } = await setup();
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    await useCases.approve(draft.id, admin);
    await projects.updateStatus(project.id, PROJECT_STATUS.MARKET_PAYMENT_HELD);
    await expect(useCases.execute(draft.id)).rejects.toThrow(/DELIVERED_TO_BUYER/);
    expect((gateway as FakeGateway).requests).toHaveLength(0);
  });

  it("refuses to execute a draft", async () => {
    const { useCases, project } = await setup();
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    await expect(useCases.execute(draft.id)).rejects.toThrow(DomainError);
  });

  it("allows one active settlement per project: a second create or approve is refused while one is approved", async () => {
    const { useCases, project } = await setup();
    const first = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    const second = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    await useCases.approve(first.id, admin);
    await expect(useCases.approve(second.id, admin)).rejects.toThrow(DomainError);
    await expect(useCases.create(project.id, admin, { ...sampleTerms(), days: 365 })).rejects.toThrow(DomainError);
  });
});

// PRD v3 Fase 3 paso 5 / RF-26: in open-payments mode the fiduciaria approves a liquidation grant on custody before any payout.
describe("SettlementUseCases liquidation grant (RF-26)", () => {
  const approvedWithGrant = async () => {
    const gateway = new FakeGateway((r) => ({ status: "completado", reference: `REF-${r.lineId}` }));
    const s = await setup(gateway, new FakeLiquidationFunding());
    const draft = await s.useCases.create(s.project.id, admin, { ...sampleTerms(), days: 365 });
    await s.useCases.approve(draft.id, fidu);
    return { ...s, gateway, liquidation: s.liquidation as FakeLiquidationFunding, id: draft.id };
  };

  it("refuses to execute (409) before the liquidation grant is approved, without reaching the gateway", async () => {
    const { useCases, gateway, settlements, id } = await approvedWithGrant();
    await expect(useCases.execute(id)).rejects.toThrow(/liquidation grant/);
    expect(gateway.requests).toHaveLength(0);
    expect((await settlements.findById(id))?.status).toBe(SETTLEMENT_STATUS.APPROVED);
  });

  it("starts the grant only for an approved settlement and returns the consent URL", async () => {
    const { useCases, liquidation, id } = await approvedWithGrant();
    expect(await useCases.startLiquidationGrant(id)).toEqual({ redirectUrl: `https://wallet.test/consent/${id}` });
    expect(liquidation.started).toEqual([id]);
  });

  it("refuses to start the grant of a draft, or once the grant is active", async () => {
    const s = await setup(undefined, new FakeLiquidationFunding());
    const draft = await s.useCases.create(s.project.id, admin, { ...sampleTerms(), days: 365 });
    await expect(s.useCases.startLiquidationGrant(draft.id)).rejects.toThrow(DomainError);
    await s.useCases.approve(draft.id, fidu);
    await s.useCases.completeLiquidationGrant(draft.id, { interactRef: "r", hash: "h" });
    await expect(s.useCases.startLiquidationGrant(draft.id)).rejects.toThrow(/already/);
  });

  it("pays every payout with the liquidation grant scope once approved, and revokes it when the settlement is executed", async () => {
    const { useCases, gateway, liquidation, id } = await approvedWithGrant();
    await useCases.completeLiquidationGrant(id, { interactRef: "r", hash: "h" });
    const executed = await useCases.execute(id);
    expect(executed.status).toBe(SETTLEMENT_STATUS.EXECUTED);
    expect(gateway.requests.every((r) => r.grantScope === "liquidation" && r.milestoneId === id)).toBe(true);
    expect(liquidation.revoked).toEqual([id]);
  });

  it("answers null in simulated mode: nothing to approve", async () => {
    const { useCases, project } = await setup();
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    await useCases.approve(draft.id, fidu);
    expect(await useCases.startLiquidationGrant(draft.id)).toBeNull();
  });
});

describe("SettlementUseCases.get", () => {
  it("lets the owner producer, investors, operator and fiduciaria read the plan; another producer gets 404", async () => {
    const { useCases, project } = await setup();
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), days: 365 });
    for (const viewer of [owner, investor, admin, fidu]) expect((await useCases.get(draft.id, viewer)).id).toBe(draft.id);
    await expect(useCases.get(draft.id, otherProducer)).rejects.toThrow(NotFoundError);
    await expect(useCases.get("nope", admin)).rejects.toThrow(NotFoundError);
  });
});

// Block 4: without investors in the body, the cascade pays the project's captured investments.
describe("SettlementUseCases with captured investors", () => {
  class FakeCaptured extends CapturedInvestors {
    constructor(private readonly positions: InvestorPosition[]) {
      super();
    }
    async forProject() {
      return this.positions;
    }
    async investmentIdsOf() {
      return [];
    }
  }

  it("builds the capital tier from the captured investments when the request has no investors", async () => {
    const { projects, settlements, gateway, project } = await setup();
    const captured = sampleTerms().investors;
    const useCases = new SettlementUseCases(projects, settlements, gateway, wallets, new SimulatedLiquidationFunding(), new FakeCaptured(captured));
    const preview = await useCases.preview(project.id, admin, { ...sampleTerms(), investors: null, days: 365 });
    expect(preview.terms.investors).toEqual(captured);
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), investors: null, days: 365 });
    expect(draft.terms.investors).toEqual(captured);
  });

  it("the explicit investors of the body win", async () => {
    const { projects, settlements, gateway, project } = await setup();
    const useCases = new SettlementUseCases(projects, settlements, gateway, wallets, new SimulatedLiquidationFunding(), new FakeCaptured([]));
    expect((await useCases.preview(project.id, admin, { ...sampleTerms(), days: 365 })).terms.investors).toEqual(sampleTerms().investors);
  });

  it("refuses on the investors field when nothing was captured", async () => {
    const { projects, settlements, gateway, project } = await setup();
    const useCases = new SettlementUseCases(projects, settlements, gateway, wallets, new SimulatedLiquidationFunding(), new FakeCaptured([]));
    await expect(useCases.preview(project.id, admin, { ...sampleTerms(), investors: null, days: 365 })).rejects.toThrow(ValidationError);
  });
});
