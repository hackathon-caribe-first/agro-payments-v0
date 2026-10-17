// Test doubles for the negotiation specs: an in-memory store, a fixed clock, a user directory and the two custody modes.
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { UserDirectory } from "../../auth/ports/user-directory";
import type { Milestone } from "../../milestones/application/milestone";
import { FakeRepository } from "../../milestones/application/testing";
import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import { buildProject, type Project, PROJECT_STATUS } from "../../projects/application/project";
import { InMemoryPaymentSteps } from "../../support/application/testing";
import { CustodyDeposit, type DepositOrder, type DepositResult } from "../ports/custody-deposit";
import { type LedgerRecord, type NegotiationFilter, type NegotiationRecord, NegotiationStore, type OpenRequestFilter, type OpenRequestRecord } from "../ports/negotiation-store";
import { type Clock, NegotiationsService } from "./negotiations.service";

const clone = <T>(value: T): T => structuredClone(value);

// Copies on the way in and out, like a database would.
export class InMemoryNegotiationStore extends NegotiationStore {
  readonly negotiations = new Map<string, NegotiationRecord>();
  readonly openRequests = new Map<string, OpenRequestRecord>();
  readonly projects = new Map<string, Project>();
  readonly ledger: LedgerRecord[] = [];

  async findNegotiation(id: string) {
    const found = this.negotiations.get(id);
    return found ? clone(found) : null;
  }
  async listNegotiations(f: NegotiationFilter) {
    return [...this.negotiations.values()]
      .filter((n) => (!f.projectId || n.project_id === f.projectId) && (!f.buyerId || n.buyer_id === f.buyerId))
      .filter((n) => (!f.producerId || n.producer_id === f.producerId) && (!f.openRequestId || n.open_request_id === f.openRequestId))
      .map(clone);
  }
  async saveNegotiation(n: NegotiationRecord) {
    this.negotiations.set(n.id, clone(n));
  }
  async findOpenRequest(id: string) {
    const found = this.openRequests.get(id);
    return found ? clone(found) : null;
  }
  async listOpenRequests(f: OpenRequestFilter) {
    return [...this.openRequests.values()].filter((o) => (!f.status || o.status === f.status) && (!f.buyerId || o.buyer_id === f.buyerId)).map(clone);
  }
  async saveOpenRequest(o: OpenRequestRecord) {
    this.openRequests.set(o.id, clone(o));
  }
  async findProject(id: string) {
    const found = this.projects.get(id);
    return found ? clone(found) : null;
  }
  async listProjects() {
    return [...this.projects.values()].map(clone);
  }
  async listLedger(projectId: string) {
    return this.ledger.filter((e) => e.project_id === projectId).map(clone);
  }
  async addLedgerEntry(entry: LedgerRecord) {
    this.ledger.push(clone(entry));
  }
  async creditCustody(projectId: string, amountMinor: number) {
    const project = this.projects.get(projectId)!;
    this.projects.set(projectId, { ...project, custodyBalance: project.custodyBalance + amountMinor, currentStatus: PROJECT_STATUS.FUNDED_IN_CUSTODY });
  }
  async transaction<T>(_projectId: string, work: (store: NegotiationStore) => Promise<T>): Promise<T> {
    return work(this);
  }
}

export class FakeDirectory extends UserDirectory {
  constructor(private readonly users: AuthenticatedUser[]) {
    super();
  }
  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
}

/** Simulated mode: the money moves at once. */
export class InstantCustody extends CustodyDeposit {
  readonly orders: DepositOrder[] = [];
  async start(order: DepositOrder) {
    this.orders.push(order);
    return null;
  }
  async complete(): Promise<DepositResult> {
    throw new Error("nothing to complete in simulated mode");
  }
  async confirm() {
    return null;
  }
}

/** Open Payments mode: the buyer approves at the wallet, then the callback completes (or leaves it unconfirmed until confirm()). */
export class RedirectCustody extends CustodyDeposit {
  readonly orders: DepositOrder[] = [];
  readonly callbacks: FundingCallback[] = [];
  /** What complete() reports once the hash checks out. */
  sent: DepositResult["status"] = "completed";
  /** What confirm() reports: null while nothing is in flight. */
  inFlight: DepositResult | null = null;
  async start(order: DepositOrder) {
    this.orders.push(order);
    return { redirectUrl: `https://wallet.test/consent/${order.negotiationId}` };
  }
  async complete(_order: DepositOrder, callback: FundingCallback) {
    this.callbacks.push(callback);
    if (callback.hash !== "good") throw new Error("hash mismatch");
    const result = { status: this.sent, reference: "https://rs.test/outgoing-payments/out-1" };
    if (result.status === "unconfirmed") this.inFlight = result;
    return result;
  }
  async confirm() {
    return this.inFlight;
  }
}

export const PRODUCER: AuthenticatedUser = { id: "u-prod", email: "productor@agro.dev", name: "Agrícola La Esperanza S.A.S.", role: "seller" };
export const BUYER: AuthenticatedUser = { id: "u-buy", email: "comprador@agro.dev", name: "Comercializadora Andina S.A.S.", role: "buyer" };
export const OTHER_BUYER: AuthenticatedUser = { id: "u-buy2", email: "otro@agro.dev", name: "Otro Comprador", role: "buyer" };
export const TODAY = "2026-10-17";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };

/** A DRAFT project of PRODUCER with two milestones: 3.000.000 + 1.000.000 and 0 + 500.000 pesos, so the quotation is 4.500.000. */
export function seedProject(store: InMemoryNegotiationStore, milestones: FakeRepository, id = "p1") {
  const { project, milestones: built } = buildProject({
    id,
    ownerUserId: PRODUCER.id,
    now: new Date("2026-10-01T12:00:00Z"),
    wallets,
    input: {
      title: "Café Castillo",
      description: "Establecimiento de plantas",
      productionType: "CAFE_ESPECIAL",
      startDate: "2026-11-01",
      estimatedEndDate: "2027-03-30",
      milestones: [
        { title: "Preparación", description: "Limpieza", estimatedCompletionDate: "2026-12-01", suppliesBudget: 3_000_000, laborBudget: 1_000_000, requirements: [] },
        { title: "Siembra", description: "Siembra", estimatedCompletionDate: "2027-01-15", suppliesBudget: 0, laborBudget: 500_000, requirements: [] },
      ],
    },
  });
  store.projects.set(id, { ...project, projectCode: "AGR-2026-001" });
  for (const m of built) void milestones.save(m);
  return built;
}

export function setup(custody: CustodyDeposit = new InstantCustody(), now = `${TODAY}T15:00:00.000Z`) {
  const store = new InMemoryNegotiationStore();
  const milestones = new FakeRepository(new Map<string, Milestone>());
  const clock: Clock & { set(iso: string): void } = {
    current: new Date(now),
    now() {
      return this.current;
    },
    set(iso: string) {
      this.current = new Date(iso);
    },
  } as Clock & { current: Date; set(iso: string): void };
  const steps = new InMemoryPaymentSteps();
  const service = new NegotiationsService(store, milestones, new FakeDirectory([PRODUCER, BUYER, OTHER_BUYER]), custody, clock, undefined, steps);
  const built = seedProject(store, milestones);
  return { store, milestones, service, clock, custody, built, steps };
}
