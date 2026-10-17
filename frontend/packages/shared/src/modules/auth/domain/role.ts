// Roles of the platform (PRD RNF-07). "UNKNOWN" is the fallback for a role this client does not recognize: it grants nothing.

export const KNOWN_ROLES = ["PRODUCER", "INVESTOR", "VERIFIER", "SUPPLIER", "BUYER", "OPERATOR"] as const;
export type KnownRole = (typeof KNOWN_ROLES)[number];
export type Role = KnownRole | "UNKNOWN";

export const ROLE_LABELS: Record<Role, string> = {
  PRODUCER: "Productor",
  INVESTOR: "Inversor",
  VERIFIER: "Verificador",
  SUPPLIER: "Proveedor",
  BUYER: "Comprador",
  OPERATOR: "Operador",
  UNKNOWN: "Sin rol",
};

export const toRole = (raw: string): Role => KNOWN_ROLES.find((role) => role === raw) ?? "UNKNOWN";

// The identity of a signed-in person. It never carries secrets (no password, no token).
export interface Session {
  userId: string;
  name: string;
  email: string;
  role: Role;
  // The id of the producer / investor / buyer / supplier / verifier record this account acts as.
  profileId: string;
}
