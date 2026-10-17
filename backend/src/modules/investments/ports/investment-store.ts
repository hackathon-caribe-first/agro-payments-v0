import type { Project, ProjectStatus } from "../../projects/application/project";
import type { Investment } from "../domain/investment";

/** The custody ledger CREDIT of a captured investment; amount in whole pesos like the rest of the ledger. */
export type CapitalCredit = {
  id: string;
  projectId: string;
  investmentId: string;
  amount: number;
  currency: string;
  paymentReference: string | null;
  createdAt: string;
};

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class InvestmentStore {
  abstract findProject(id: string): Promise<Project | null>;
  /** Every project, oldest first. */
  abstract listProjects(): Promise<Project[]>;
  abstract findById(id: string): Promise<Investment | null>;
  /** Oldest first. */
  abstract listByProject(projectId: string): Promise<Investment[]>;
  /** Inserts or replaces the investment by id. */
  abstract save(investment: Investment): Promise<void>;
  /** Books the INVESTOR_CAPITAL credit, adds amountMinor to the project's custody balance and sets its status. */
  abstract creditCapital(credit: CapitalCredit, amountMinor: number, status: ProjectStatus): Promise<void>;
  /** Runs `work` in one transaction serialized on the project row (like NegotiationStore); `store` is bound to it. */
  abstract transaction<T>(projectId: string, work: (store: InvestmentStore) => Promise<T>): Promise<T>;
}
