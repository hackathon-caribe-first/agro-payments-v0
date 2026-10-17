import { BoundaryError, NetworkError, ValidationFailure, err, type FieldErrors, type Result } from "../../milestones/domain/errors";

// Typed errors shared by the operations & transparency modules (panel, reconciliation, trace, audit).
// Repository failures never escape as exceptions: they become values.
export type OpsError =
  | { kind: "not_found" }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string; status?: number };

export type OpsResult<T> = Result<T, OpsError>;

export async function attemptOps<T>(work: () => Promise<OpsResult<T>>): Promise<OpsResult<T>> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof ValidationFailure) return err({ kind: "validation", fieldErrors: cause.fieldErrors });
    if (cause instanceof BoundaryError) return err({ kind: "boundary", message: cause.message });
    if (cause instanceof NetworkError) return err({ kind: "network", message: cause.message, ...(cause.status !== undefined && { status: cause.status }) });
    return err({ kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" });
  }
}

export type { FieldErrors };
