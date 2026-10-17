import type { Settlement } from "../application/settlement";

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class SettlementRepository {
  /** Inserts or replaces the settlement with all its payouts, atomically. */
  abstract save(settlement: Settlement): Promise<void>;
  abstract findById(id: string): Promise<Settlement | null>;
  /** Oldest first. */
  abstract findByProject(projectId: string): Promise<Settlement[]>;
}
