import { KNOWN_ROLES, type KnownRole, type Role } from "./role";

// RNF-07: every action is authorized by role. This table is the single source of truth for the web routes; the guard of the
// layout and the sidebar both read it. The most specific matching rule decides; a path with no rule is denied.

export interface AccessRule {
  // Matches the path itself and everything below it ("/producer" matches "/producer" and "/producer/projects/1").
  prefix: string;
  // Only the path itself.
  exact?: boolean;
  roles: readonly KnownRole[];
}

export const PUBLIC_PATHS = ["/login", "/unauthorized"] as const;

export const ROLE_ACCESS: readonly AccessRule[] = [
  { prefix: "/", exact: true, roles: KNOWN_ROLES },
  { prefix: "/producer", roles: ["PRODUCER"] },
  { prefix: "/investor", roles: ["INVESTOR"] },
  { prefix: "/verifier", roles: ["VERIFIER"] },
  { prefix: "/buyer", roles: ["BUYER"] },
  { prefix: "/supplier", roles: ["SUPPLIER"] },
  { prefix: "/ops", roles: ["OPERATOR"] },
  { prefix: "/custodian", roles: ["OPERATOR"] },
  { prefix: "/notifications", roles: ["PRODUCER", "INVESTOR", "VERIFIER"] },
  // LEGACY Spanish URLs: they only redirect to the English ones, which are authorized again after the redirect.
  { prefix: "/productor", roles: ["PRODUCER"] },
  { prefix: "/comprador", roles: ["BUYER"] },
  { prefix: "/verificador", roles: ["VERIFIER"] },
  { prefix: "/custodio", roles: ["OPERATOR"] },
];

export const ROLE_HOME: Record<KnownRole, string> = {
  PRODUCER: "/producer",
  INVESTOR: "/investor",
  VERIFIER: "/verifier",
  SUPPLIER: "/supplier",
  BUYER: "/buyer",
  OPERATOR: "/ops/reconciliation",
};

const cleanPath = (pathname: string): string => {
  const path = pathname.split(/[?#]/)[0] ?? "/";
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path || "/";
};

const matches = (rule: AccessRule, path: string) => (rule.exact ? path === rule.prefix : path === rule.prefix || path.startsWith(`${rule.prefix}/`));

export const isPublicPath = (pathname: string): boolean => PUBLIC_PATHS.some((p) => cleanPath(pathname) === p);

export function canAccess(role: Role, pathname: string): boolean {
  const path = cleanPath(pathname);
  if (isPublicPath(path)) return true;
  const rule = ROLE_ACCESS.filter((r) => matches(r, path)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return rule !== undefined && (rule.roles as readonly Role[]).includes(role);
}

// Where a role lands after signing in. An unknown role has no home: it goes back to the sign-in page.
export const homePathFor = (role: Role): string => (role === "UNKNOWN" ? "/login" : ROLE_HOME[role]);

// Post sign-in destination from `?next=`: same-origin paths only (no "//host", no scheme) and only what the role can open.
export function safeNextPath(next: string | null | undefined, role: Role): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return homePathFor(role);
  const path = cleanPath(next);
  return canAccess(role, path) && !isPublicPath(path) && path !== "/" ? next : homePathFor(role);
}
