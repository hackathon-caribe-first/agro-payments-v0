import type { Role } from "../../auth/ports/role";

// Single place to remap who does what on a milestone.
export const MILESTONE_ROLES = {
  verifier: "fidu",
  producer: "seller",
  operator: "admin",
  // Funds a milestone by approving the outgoing-payment grant in their wallet.
  investor: "investor",
} as const satisfies Record<string, Role>;
