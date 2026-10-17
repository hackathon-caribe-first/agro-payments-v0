import type { SimulationInputs, SimulationSheet } from "./motor";
import type { PresetId } from "./presets";

/** One motor run for a project (RNF-11: inputs, seed and motor version travel with the sheet). */
export interface SimulationRun {
  id: string;
  projectId: string;
  /** The preset the inputs started from; null for inputs sent whole (not exposed yet). */
  preset: PresetId | null;
  inputs: SimulationInputs;
  seed: number;
  motorVersion: string;
  sheet: SimulationSheet;
  createdBy: string;
  createdAt: Date;
}
