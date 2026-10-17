import { BoundaryError, err, type FieldErrors, NetworkError, ok, type Result, ValidationFailure } from "../../milestones/domain/errors";
import type { RunSimulationInput, SimulationPreset, SimulationSheet } from "../domain/sheet";
import { Rejection, type SimulationRepository } from "./simulation-repository";

export type SimulationError =
  | { kind: "rejected"; message: string }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string };

function toError(cause: unknown): SimulationError {
  if (cause instanceof Rejection) return { kind: "rejected", message: cause.message };
  if (cause instanceof ValidationFailure) return { kind: "validation", fieldErrors: cause.fieldErrors };
  if (cause instanceof BoundaryError) return { kind: "boundary", message: cause.message };
  if (cause instanceof NetworkError) return { kind: "network", message: cause.message };
  return { kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" };
}

async function attempt<T>(work: () => Promise<T>): Promise<Result<T, SimulationError>> {
  try {
    return ok(await work());
  } catch (cause) {
    return err(toError(cause));
  }
}

export const listPresets = (repo: SimulationRepository) => attempt<SimulationPreset[]>(() => repo.listPresets());
export const getLatestSheet = (repo: SimulationRepository, projectId: string) => attempt<SimulationSheet | null>(() => repo.getLatest(projectId));
export const runSimulation = (repo: SimulationRepository, projectId: string, input: RunSimulationInput) =>
  attempt<SimulationSheet>(() => repo.run(projectId, input));
export const publishProject = (repo: SimulationRepository, projectId: string) => attempt<void>(() => repo.publish(projectId));
