import type { Investment } from "../../investments/domain/investment";
import type { Settlement } from "../../settlement/application/settlement";
import type { SimulationRun } from "../../simulation/application/simulation-run";

// Abstract class (not interface) so it doubles as the Nest DI token.
// RF-27 read side: what the investor panel reads from the investments, settlement and simulation modules. Read only.
export abstract class PanelSources {
  /** Every investment of the project, oldest first. */
  abstract investments(projectId: string): Promise<Investment[]>;
  /** Oldest first. */
  abstract settlements(projectId: string): Promise<Settlement[]>;
  abstract latestSimulation(projectId: string): Promise<SimulationRun | null>;
}
