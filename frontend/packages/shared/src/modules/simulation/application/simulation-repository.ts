import type { RunSimulationInput, SimulationPreset, SimulationSheet } from "../domain/sheet";

// Port for the motor's sheet. Implementations throw NetworkError, BoundaryError, ValidationFailure (400) or Rejection (409).
export interface SimulationRepository {
  listPresets(): Promise<SimulationPreset[]>;
  // Null when the project was never simulated (or does not exist).
  getLatest(projectId: string): Promise<SimulationSheet | null>;
  run(projectId: string, input: RunSimulationInput): Promise<SimulationSheet>;
  publish(projectId: string): Promise<void>;
}

// A 409: the server refused the action for a reason the producer can act on (form-level message).
export class Rejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Rejection";
  }
}
