// Test doubles shared by the simulation specs.
import { SimulationRunRepository } from "../ports/simulation-run.repository";
import type { SimulationRun } from "./simulation-run";

export class FakeSimulationRunRepository extends SimulationRunRepository {
  private readonly rows: SimulationRun[] = [];
  async save(run: SimulationRun) {
    this.rows.push(structuredClone(run));
  }
  async findLatest(projectId: string) {
    const rows = this.rows
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    const last = rows.at(-1);
    return last ? structuredClone(last) : null;
  }
}
