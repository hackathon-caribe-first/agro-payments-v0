// Errors raised by business rules; DomainErrorFilter maps them to HTTP so modules stay framework-free.
export class DomainError extends Error {}
export class NotFoundError extends DomainError {}

/** Field path (e.g. "milestones.2.laborBudget") → messages. */
export type FieldErrors = Record<string, string[]>;
/** Key for errors that belong to the whole input, not one field. */
export const FORM_LEVEL_KEY = "_form";

// Input that breaks a field rule (400), as opposed to a DomainError: a valid request the current state refuses (409).
// Not a DomainError on purpose: only the /api filter maps it; legacy routes never raise it.
export class ValidationError extends Error {
  constructor(
    readonly fieldErrors: FieldErrors,
    message = "Invalid payload",
  ) {
    super(message);
  }
}

export function addFieldError(errors: FieldErrors, path: string, message: string) {
  (errors[path] ??= []).push(message);
}

/** A refusal the web app shows as a form-level message: 409 with { error: "Request rejected", errors: { _form: [message] } }. */
export class RejectedError extends DomainError {}
