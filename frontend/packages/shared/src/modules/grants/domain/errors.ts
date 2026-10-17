import { BoundaryError, NetworkError, ValidationFailure, err, type FieldErrors, type Result } from "../../milestones/domain/errors";

// Business rejections (HTTP 409) the grant rules can produce. GRANT_LIMIT_EXCEEDED is never a token problem.
export const GRANT_CONFLICT_CODES = [
  "LIVE_GRANT_EXISTS",
  "PREVIOUS_GRANT_NOT_REVOKED",
  "MILESTONE_CLOSED",
  "NOT_PENDING_APPROVAL",
  "NOT_ACTIVE",
  "GRANT_LIMIT_EXCEEDED",
  "GRANT_REVOKED",
  "WALLET_ACCOUNT_MISMATCH",
  "HASH_MISMATCH",
] as const;
export type GrantConflictCode = (typeof GRANT_CONFLICT_CODES)[number] | "UNKNOWN";

export type GrantError =
  | { kind: "not_found" }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string }
  | { kind: "conflict"; code: GrantConflictCode; message: string; remaining: number | null };

export type GrantResult<T> = Result<T, GrantError>;

// Thrown by the HTTP repository when the server answers a business conflict (409).
export class GrantConflict extends Error {
  constructor(
    readonly code: GrantConflictCode,
    message: string,
    readonly remaining: number | null,
  ) {
    super(message);
    this.name = "GrantConflict";
  }
}

// Repository failures never escape as exceptions: they become typed errors.
export async function attemptGrant<T>(work: () => Promise<GrantResult<T>>): Promise<GrantResult<T>> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof GrantConflict) return err({ kind: "conflict", code: cause.code, message: cause.message, remaining: cause.remaining });
    if (cause instanceof ValidationFailure) return err({ kind: "validation", fieldErrors: cause.fieldErrors });
    if (cause instanceof BoundaryError) return err({ kind: "boundary", message: cause.message });
    if (cause instanceof NetworkError) return err({ kind: "network", message: cause.message });
    return err({ kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" });
  }
}

export type { FieldErrors };
