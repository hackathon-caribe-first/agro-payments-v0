// verifier (PRD v3): the technical verifier, a different actor from the fiduciaria (fidu). Assigned by an admin, like fidu.
export const ROLES = ["admin", "buyer", "seller", "investor", "fidu", "intermediator", "verifier"] as const;

export type Role = (typeof ROLES)[number];

// Roles a person may pick for themselves at sign-up. admin, fidu and verifier are only assigned by an admin.
export const SELF_SELECTABLE_ROLES = ["buyer", "seller", "investor", "intermediator"] as const satisfies readonly Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isSelfSelectableRole(value: unknown): value is (typeof SELF_SELECTABLE_ROLES)[number] {
  return typeof value === "string" && (SELF_SELECTABLE_ROLES as readonly string[]).includes(value);
}
