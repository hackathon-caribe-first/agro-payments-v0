export const ROLES = ["admin", "buyer", "seller", "investor", "fidu", "intermediator"] as const;

export type Role = (typeof ROLES)[number];

// Roles a person may pick for themselves at sign-up. admin and fidu are only assigned by an admin.
export const SELF_SELECTABLE_ROLES = ["buyer", "seller", "investor", "intermediator"] as const satisfies readonly Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isSelfSelectableRole(value: unknown): value is (typeof SELF_SELECTABLE_ROLES)[number] {
  return typeof value === "string" && (SELF_SELECTABLE_ROLES as readonly string[]).includes(value);
}
