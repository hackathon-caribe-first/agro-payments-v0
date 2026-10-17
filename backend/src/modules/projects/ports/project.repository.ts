import type { Milestone } from "../../milestones/application/milestone";
import type { NewProject, Project } from "../application/project";

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class ProjectRepository {
  /** Stores the project and its milestones atomically and allocates the next AGR-YYYY-NNN code for the year it was created. */
  abstract create(project: NewProject, milestones: Milestone[]): Promise<Project>;
  abstract findById(id: string): Promise<Project | null>;
  /** Oldest first. */
  abstract findByOwner(ownerUserId: string): Promise<Project[]>;
}
