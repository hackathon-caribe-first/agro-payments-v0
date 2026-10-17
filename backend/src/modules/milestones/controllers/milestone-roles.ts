import type { Role } from "../../auth/ports/role";

// Single place to remap who does what on a milestone.
// PRD v3: the fiduciaria approves each milestone grant on the custody wallet; the technical verifier (a different actor) issues the verdict.
export const MILESTONE_ROLES = {
  verifier: "verifier",
  fiduciaria: "fidu",
  producer: "seller",
  operator: "admin",
  // Reads projects and settlements; since v3 investors fund the custody (capture), not milestones.
  investor: "investor",
} as const satisfies Record<string, Role>;
