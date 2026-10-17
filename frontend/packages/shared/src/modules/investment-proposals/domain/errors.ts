import { BoundaryError, NetworkError, ValidationFailure, err, type FieldErrors, type Result } from "../../milestones/domain/errors";
import type { Actor } from "./investment";

export type ProposeBlock = "project_status" | "contract_exists" | "duplicate";
export type SignBlock = "not_pending" | "already_signed" | "not_party";

// Same shape family as the presales errors, with the investment conflicts.
export type InvestmentError =
  | { kind: "not_found" }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string }
  | { kind: "invalid_transition"; from: string; action: string }
  | { kind: "not_your_turn"; turn: Actor | null }
  | { kind: "not_proposable"; reason: ProposeBlock }
  | { kind: "not_signable"; reason: SignBlock };

export type InvestmentResult<T> = Result<T, InvestmentError>;

// Repository failures never escape as exceptions: they become typed errors.
export async function attemptInvestment<T>(work: () => Promise<InvestmentResult<T>>): Promise<InvestmentResult<T>> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof ValidationFailure) return err({ kind: "validation", fieldErrors: cause.fieldErrors });
    if (cause instanceof BoundaryError) return err({ kind: "boundary", message: cause.message });
    if (cause instanceof NetworkError) return err({ kind: "network", message: cause.message });
    return err({ kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" });
  }
}
