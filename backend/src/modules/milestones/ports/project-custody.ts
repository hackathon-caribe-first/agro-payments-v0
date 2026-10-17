import type { ProjectStatus } from "../../projects/application/project";

/** The project's status and what its custody still holds (RF-21 statement balance, minor units; negative when overdrawn). */
export type CustodyStanding = { status: ProjectStatus; available: number };

// Abstract class (not interface) so it doubles as the Nest DI token.
// RF-05 / RF-13: a project milestone only moves custody money once the project's custody is funded and covers it.
export abstract class ProjectCustody {
  /** null when the project does not exist. */
  abstract standing(projectId: string): Promise<CustodyStanding | null>;
}
