import { BoundaryError, NetworkError, ValidationFailure, err, type FieldErrors, type Result } from "../../milestones/domain/errors";
import type { Actor } from "./presale";

// Same shape family as the milestones errors, with presale and negotiation conflicts.
export type PresaleError =
  | { kind: "not_found" }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string }
  | { kind: "invalid_transition"; from: string; action: string }
  | { kind: "not_your_turn"; turn: Actor | null }
  | { kind: "over_allocated"; remaining: number }
  | { kind: "duplicate_negotiation" }
  | { kind: "backing_mismatch"; reason: "closed" | "not_owned" }
  | { kind: "not_negotiable"; reason: "own_project" | "project_status" | "project_agreed" | "milestone_status" | "milestone_agreed" | "duplicate" }
  | { kind: "deposit_unavailable"; reason: "not_project" | "not_agreed" | "already_deposited" | "not_owner" | "project_status" | "no_total" }
  | { kind: "total_changed"; total: number };

export type PresaleResult<T> = Result<T, PresaleError>;

// Repository failures never escape as exceptions: they become typed errors.
export async function attemptPresale<T>(work: () => Promise<PresaleResult<T>>): Promise<PresaleResult<T>> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof ValidationFailure) return err({ kind: "validation", fieldErrors: cause.fieldErrors });
    if (cause instanceof BoundaryError) return err({ kind: "boundary", message: cause.message });
    if (cause instanceof NetworkError) return err({ kind: "network", message: cause.message });
    return err({ kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" });
  }
}
