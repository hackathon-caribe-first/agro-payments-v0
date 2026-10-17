import { BoundaryError, NetworkError, ValidationFailure, err, type FieldErrors, type Result } from "../../milestones/domain/errors";

export type HarvestError =
  | { kind: "not_found" }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string };

export type HarvestResult<T> = Result<T, HarvestError>;

// Repository failures never escape as exceptions: they become typed errors.
export async function attemptHarvest<T>(work: () => Promise<HarvestResult<T>>): Promise<HarvestResult<T>> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof ValidationFailure) return err({ kind: "validation", fieldErrors: cause.fieldErrors });
    if (cause instanceof BoundaryError) return err({ kind: "boundary", message: cause.message });
    if (cause instanceof NetworkError) return err({ kind: "network", message: cause.message });
    return err({ kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" });
  }
}
