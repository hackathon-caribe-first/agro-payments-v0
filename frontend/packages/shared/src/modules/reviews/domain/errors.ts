import type { FieldErrors } from "../../milestones/domain/errors";
import type { MilestoneStatus } from "../../milestones/domain/milestone";

export type ReviewError =
  | { kind: "not_found" }
  | { kind: "not_assigned" }
  | { kind: "invalid_transition"; status: MilestoneStatus }
  | { kind: "payout_blocked" }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string };
