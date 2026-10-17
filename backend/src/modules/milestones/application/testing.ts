// Test doubles shared by the use case specs.
import { type LinePaymentRequest, type LinePaymentResult, PaymentGateway } from "../ports/payment-gateway";
import { type FundingCallback, MilestoneFunding } from "../ports/milestone-funding";
import { MilestoneRepository } from "../ports/milestone.repository";
import { createMilestone, fund, LINE_KIND, type Milestone } from "./milestone";
import { MilestoneStore } from "./milestone-store";

// Funded by default: most specs exercise payments, the funding gate is tested on unfundedMilestone.
export const unfundedMilestone = (): Milestone =>
  createMilestone({
    id: "m1",
    title: "Siembra",
    amount: 1_000_000,
    lines: [
      { id: "l-prod", kind: LINE_KIND.PRODUCTOR, beneficiary: "Productor", walletAddress: "https://wallet.test/prod", amount: 600_000 },
      { id: "l-prov", kind: LINE_KIND.PROVEEDOR, beneficiary: "Proveedor", walletAddress: "https://wallet.test/prov", amount: 300_000 },
      { id: "l-fee", kind: LINE_KIND.PLATAFORMA, beneficiary: "Plataforma", walletAddress: "https://wallet.test/fee", amount: 100_000 },
    ],
  });

export const sampleMilestone = (): Milestone => fund(unfundedMilestone(), new Date("2026-10-16T12:00:00Z"));

class FakeRepository extends MilestoneRepository {
  constructor(private readonly milestones: Map<string, Milestone>) {
    super();
  }
  async findAll() {
    return [...this.milestones.values()];
  }
  async findById(id: string) {
    return this.milestones.get(id) ?? null;
  }
  async save(m: Milestone) {
    this.milestones.set(m.id, m);
  }
}

export const storeWith = (...milestones: Milestone[]) =>
  new MilestoneStore(new FakeRepository(new Map(milestones.map((m) => [m.id, m]))));

// Answers per wallet address; records every request so specs can assert what reached the gateway.
export class FakeGateway extends PaymentGateway {
  readonly requests: LinePaymentRequest[] = [];
  readonly checks: string[] = [];
  constructor(
    private readonly onPay: (r: LinePaymentRequest) => LinePaymentResult = () => ({ status: "completado", reference: "REF-1" }),
    private readonly onCheck: (reference: string) => LinePaymentResult = (reference) => ({ status: "completado", reference }),
  ) {
    super();
  }
  async pay(request: LinePaymentRequest) {
    this.requests.push(request);
    return this.onPay(request);
  }
  async check(reference: string) {
    this.checks.push(reference);
    return this.onCheck(reference);
  }
}

export class ThrowingGateway extends PaymentGateway {
  async pay(): Promise<LinePaymentResult> {
    throw new Error("network down");
  }
  async check(): Promise<LinePaymentResult> {
    throw new Error("network down");
  }
}

// Records the funding calls; `fail` makes complete() reject like a bad hash would.
export class FakeFunding extends MilestoneFunding {
  readonly started: string[] = [];
  readonly completed: { milestoneId: string; params: FundingCallback }[] = [];
  constructor(private readonly fail = false) {
    super();
  }
  async start(milestone: Milestone) {
    this.started.push(milestone.id);
    return { redirectUrl: `https://wallet.test/consent/${milestone.id}` };
  }
  async complete(milestoneId: string, params: FundingCallback) {
    if (this.fail) throw new Error("hash mismatch");
    this.completed.push({ milestoneId, params });
  }
}
