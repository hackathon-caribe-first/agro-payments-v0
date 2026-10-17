import type { Milestone } from "../application/milestone";

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class MilestoneRepository {
  abstract findAll(): Promise<Milestone[]>;
  abstract findById(id: string): Promise<Milestone | null>;
  /** Ordered by sequenceOrder. */
  abstract findByProject(projectId: string): Promise<Milestone[]>;
  abstract save(milestone: Milestone): Promise<void>;
}
