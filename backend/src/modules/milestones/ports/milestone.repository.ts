import type { Milestone } from "../application/milestone";

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class MilestoneRepository {
  abstract findAll(): Promise<Milestone[]>;
  abstract findById(id: string): Promise<Milestone | null>;
  abstract save(milestone: Milestone): Promise<void>;
}
