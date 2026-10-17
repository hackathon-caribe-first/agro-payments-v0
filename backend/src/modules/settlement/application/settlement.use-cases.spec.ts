import { DomainError, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import { FakeGateway, FakeRepository, ThrowingGateway } from "../../milestones/application/testing";
import type { PaymentGateway } from "../../milestones/ports/payment-gateway";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { PROJECT_STATUS, type Viewer } from "../../projects/application/project";
import { FakeProjectRepository } from "../../projects/application/testing";
import { PAYOUT_STATUS, SETTLEMENT_STATUS } from "./settlement";
import { SettlementUseCases } from "./settlement.use-cases";
import { CapturedInvestors } from "../ports/captured-investors";
import type { InvestorPosition } from "./settlement";
import { FakeSettlementRepository, sampleTerms } from "./testing";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const owner: Viewer = { id: "u-prod", role: "seller" };
const otherProducer: Viewer = { id: "u-other", role: "seller" };
const admin: Viewer = { id: "u-admin", role: "admin" };
const fidu: Viewer = { id: "u-fidu", role: "fidu" };
const investor: Viewer = { id: "u-inv", role: "investor" };

async function setup(gateway: PaymentGateway = new FakeGateway((r) => ({ status: "en_cola", reference: `REF-${r.lineId}` }))) {
  const projects = new FakeProjectRepository(new FakeRepository(new Map()));
  const project = await new CreateProjectUseCase(projects, wallets).execute(owner, {
    title: "Tomate bajo invernadero",
    description: "Ciclo de 120 días",
    productionType: "OTRO",
    startDate: "2026-11-01",
    // 120 days: d of the cycle when the request does not send it.
    estimatedEndDate: "2027-03-01",
    milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100, laborBudget: 200, requirements: [] }],
  });
  const settlements = new FakeSettlementRepository();
  return { projects, project, settlements, gateway, useCases: new SettlementUseCases(projects, settlements, gateway, wallets) };
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
  }

  it("builds the capital tier from the captured investments when the request has no investors", async () => {
    const { projects, settlements, gateway, project } = await setup();
    const captured = sampleTerms().investors;
    const useCases = new SettlementUseCases(projects, settlements, gateway, wallets, new FakeCaptured(captured));
    const preview = await useCases.preview(project.id, admin, { ...sampleTerms(), investors: null, days: 365 });
    expect(preview.terms.investors).toEqual(captured);
    const draft = await useCases.create(project.id, admin, { ...sampleTerms(), investors: null, days: 365 });
    expect(draft.terms.investors).toEqual(captured);
  });

  it("the explicit investors of the body win", async () => {
    const { projects, settlements, gateway, project } = await setup();
    const useCases = new SettlementUseCases(projects, settlements, gateway, wallets, new FakeCaptured([]));
    expect((await useCases.preview(project.id, admin, { ...sampleTerms(), days: 365 })).terms.investors).toEqual(sampleTerms().investors);
  });

  it("refuses on the investors field when nothing was captured", async () => {
    const { projects, settlements, gateway, project } = await setup();
    const useCases = new SettlementUseCases(projects, settlements, gateway, wallets, new FakeCaptured([]));
    await expect(useCases.preview(project.id, admin, { ...sampleTerms(), investors: null, days: 365 })).rejects.toThrow(ValidationError);
  });
});
