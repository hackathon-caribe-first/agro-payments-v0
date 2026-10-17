import { BoundaryError, NetworkError, ValidationFailure, err, type FieldErrors, type Result } from "../../milestones/domain/errors";

export type PaymentLinesError =
  | { kind: "not_found" }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string }
  // The line is not pending any more: it can no longer be edited or removed.
  | { kind: "line_locked" };

export type PaymentLinesResult<T> = Result<T, PaymentLinesError>;

// Repository failures never escape as exceptions: they become typed errors.
export async function attemptLines<T>(work: () => Promise<PaymentLinesResult<T>>): Promise<PaymentLinesResult<T>> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof ValidationFailure) return err({ kind: "validation", fieldErrors: cause.fieldErrors });
    if (cause instanceof BoundaryError) return err({ kind: "boundary", message: cause.message });
    if (cause instanceof NetworkError) return err({ kind: "network", message: cause.message });
    return err({ kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" });
  }
}
