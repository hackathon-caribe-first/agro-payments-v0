import type { SimulationRun } from "../application/simulation-run";

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class SimulationRunRepository {
  /** Runs are immutable: insert only. */
  abstract save(run: SimulationRun): Promise<void>;
  /** The newest run of the project (created_at, then id), or null. */
  abstract findLatest(projectId: string): Promise<SimulationRun | null>;
}
