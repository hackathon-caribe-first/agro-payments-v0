import type { MilestoneStatus } from "./milestone";

export type FieldErrors = Record<string, string[]>;

// Key under which errors that belong to the whole form (not one field) are reported.
export const FORM_LEVEL_KEY = "_form";

export type MilestoneError =
  | { kind: "not_found" }
  | { kind: "invalid_transition"; status: MilestoneStatus }
  | { kind: "incomplete_requirements"; missing: string[] }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string };

export type Result<T, E = MilestoneError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;

// Thrown by transport implementations when the server cannot be reached or answers with an unexpected status.
export class NetworkError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

// Thrown by transport implementations when the server rejects input (HTTP 400) with field-level errors.
export class ValidationFailure extends Error {
  constructor(readonly fieldErrors: FieldErrors) {
    super("Server rejected the input");
    this.name = "ValidationFailure";
  }
}

// Thrown by the infrastructure mapper when a transport payload does not match the expected DTO shape.
export class BoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoundaryError";
  }
}
