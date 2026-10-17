import type { Project, ProjectStatus } from "../../projects/application/project";
import type { Harvest } from "../domain/harvest";

/** The custody ledger CREDIT of a harvest payment; amount in whole pesos like the rest of the ledger. */
export type HarvestCredit = {
  id: string;
  projectId: string;
  amount: number;
  currency: string;
  buyerUserId: string;
  paymentReference: string | null;
  createdAt: string;
};

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class HarvestStore {
  abstract findProject(id: string): Promise<Project | null>;
  abstract findHarvest(projectId: string): Promise<Harvest | null>;
  /** Every harvest, oldest declaration first. */
  abstract listHarvests(): Promise<Harvest[]>;
  /** Inserts or replaces the project's harvest. */
  abstract saveHarvest(harvest: Harvest): Promise<void>;
  abstract setProjectStatus(projectId: string, status: ProjectStatus): Promise<void>;
  /** Books the HARVEST_PAYMENT credit (one per project) and adds amountMinor to the project's custody balance. */
  abstract creditHarvest(credit: HarvestCredit, amountMinor: number): Promise<void>;
  /** The custody ledger's credits by category, in the project's minor units. */
  abstract creditsByCategory(projectId: string): Promise<Record<string, number>>;
  /** Runs `work` in one transaction serialized on the project row (like NegotiationStore); `store` is bound to it. */
  abstract transaction<T>(projectId: string, work: (store: HarvestStore) => Promise<T>): Promise<T>;
}
