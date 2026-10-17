import type { DataSource } from "typeorm";
import type { SimulationInputs, SimulationSheet } from "../../application/motor";
import type { PresetId } from "../../application/presets";
import type { SimulationRun } from "../../application/simulation-run";
import { SimulationRunRepository } from "../../ports/simulation-run.repository";

type SimulationRunRow = {
  id: string;
  project_id: string;
  preset: string | null;
  inputs: SimulationInputs;
  seed: string;
  motor_version: string;
  outputs: SimulationSheet;
  created_by: string;
  created_at: Date;
};

const toRun = (r: SimulationRunRow): SimulationRun => ({
  id: r.id,
  projectId: r.project_id,
  preset: r.preset as PresetId | null,
  inputs: r.inputs,
  seed: Number(r.seed),
  motorVersion: r.motor_version,
  sheet: r.outputs,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

// Plain SQL, no entities: inputs and outputs are jsonb snapshots read back whole.
export class TypeOrmSimulationRunAdapter extends SimulationRunRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async save(run: SimulationRun) {
    await this.dataSource.query(
      `INSERT INTO simulation_runs (id, project_id, preset, inputs, seed, motor_version, outputs, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [run.id, run.projectId, run.preset, JSON.stringify(run.inputs), run.seed, run.motorVersion, JSON.stringify(run.sheet), run.createdBy, run.createdAt],
    );
  }

  async findLatest(projectId: string) {
    const rows: SimulationRunRow[] = await this.dataSource.query("SELECT * FROM simulation_runs WHERE project_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1", [projectId]);
    return rows[0] ? toRun(rows[0]) : null;
  }
}
