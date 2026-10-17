// Test doubles for the harvest and investor panel specs.
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import type { Investment } from "../../investments/domain/investment";
import type { FundingCallback } from "../../milestones/ports/milestone-funding";
import type { Project, ProjectStatus } from "../../projects/application/project";
import type { Settlement } from "../../settlement/application/settlement";
import type { SimulationRun } from "../../simulation/application/simulation-run";
import type { Harvest } from "../domain/harvest";
import { HarvestPayment, type HarvestOrder } from "../ports/harvest-payment";
import { type HarvestCredit, HarvestStore } from "../ports/harvest-store";
import { PanelSources } from "../ports/panel-sources";

const clone = <T>(value: T): T => structuredClone(value);

export const PRODUCER: AuthenticatedUser = { id: "u-prod", email: "productor@agro.dev", name: "Productor", role: "seller" };
export const VERIFIER: AuthenticatedUser = { id: "u-ver", email: "verificador@agro.dev", name: "Verificador", role: "verifier" };
export const HARVEST_BUYER: AuthenticatedUser = { id: "u-buyer", email: "comprador@agro.dev", name: "Comprador", role: "buyer" };
export const OTHER_BUYER: AuthenticatedUser = { id: "u-buyer-2", email: "otro@agro.dev", name: "Otro", role: "buyer" };
export const ADMIN: AuthenticatedUser = { id: "u-admin", email: "admin@agro.dev", name: "Admin", role: "admin" };

export class FakeHarvestStore extends HarvestStore {
  readonly projects = new Map<string, Project>();
  readonly harvests = new Map<string, Harvest>();
  readonly credits: HarvestCredit[] = [];

  constructor(...projects: Project[]) {
    super();
    for (const p of projects) this.projects.set(p.id, clone(p));
  }
  async findProject(id: string) {
    const p = this.projects.get(id);
    return p ? clone(p) : null;
  }
  async findHarvest(projectId: string) {
    const h = this.harvests.get(projectId);
    return h ? clone(h) : null;
  }
  async listHarvests() {
    return [...this.harvests.values()].sort((a, b) => a.declaredAt.getTime() - b.declaredAt.getTime()).map(clone);
  }
  async saveHarvest(harvest: Harvest) {
    this.harvests.set(harvest.projectId, clone(harvest));
  }
  async setProjectStatus(projectId: string, status: ProjectStatus) {
    const p = this.projects.get(projectId);
    if (p) p.currentStatus = status;
  }
  async creditHarvest(credit: HarvestCredit, amountMinor: number) {
    if (this.credits.some((c) => c.projectId === credit.projectId)) throw new Error("duplicate harvest credit");
    this.credits.push(clone(credit));
    const p = this.projects.get(credit.projectId);
    if (p) p.custodyBalance += amountMinor;
  }
  async creditsByCategory(projectId: string): Promise<Record<string, number>> {
    const p = this.projects.get(projectId);
    const total = this.credits.filter((c) => c.projectId === projectId).reduce((sum, c) => sum + c.amount * 10 ** (p?.assetScale ?? 2), 0);
    return total > 0 ? { HARVEST_PAYMENT: total } : {};
  }
  transaction<T>(_projectId: string, work: (store: HarvestStore) => Promise<T>): Promise<T> {
    return work(this);
  }
}

/** Open-payments-like: start asks for consent, complete pays. `interactive: false` behaves like the simulated adapter. */
export class FakeHarvestPayment extends HarvestPayment {
  readonly started: HarvestOrder[] = [];
  readonly completed: HarvestOrder[] = [];
  constructor(private readonly interactive = true) {
    super();
  }
  async start(order: HarvestOrder) {
    this.started.push(order);
    return this.interactive ? { redirectUrl: `https://wallet.test/consent/${order.projectId}` } : null;
  }
  async complete(order: HarvestOrder, _callback: FundingCallback) {
    this.completed.push(order);
    return { reference: `OUT-${order.projectId}` };
  }
}

export class FakePanelSources extends PanelSources {
  constructor(
    readonly investmentRows: Investment[] = [],
    readonly settlementRows: Settlement[] = [],
    readonly run: SimulationRun | null = null,
  ) {
    super();
  }
  async investments(projectId: string) {
    return this.investmentRows.filter((i) => i.projectId === projectId);
  }
  async settlements(projectId: string) {
    return this.settlementRows.filter((s) => s.projectId === projectId);
  }
  async latestSimulation(projectId: string) {
    return this.run?.projectId === projectId ? this.run : null;
  }
}
