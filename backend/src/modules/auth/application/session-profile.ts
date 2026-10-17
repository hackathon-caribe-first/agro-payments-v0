import type { Role } from "../ports/role";
import type { AuthenticatedUser } from "../ports/session-resolver";
import { DEMO_PARTIES } from "./demo-parties";

// The web app's role model (RNF-07): one uppercase role per area of the sidebar.
export type WebRole = "PRODUCER" | "BUYER" | "INVESTOR" | "VERIFIER" | "OPERATOR" | "UNKNOWN";

const WEB_ROLES: Readonly<Record<Role, WebRole>> = {
  seller: "PRODUCER",
  buyer: "BUYER",
  investor: "INVESTOR",
  verifier: "VERIFIER",
  fidu: "OPERATOR",
  admin: "OPERATOR",
  intermediator: "UNKNOWN",
};

// ponytail: demo only. The record ids the web app hardcodes for each seeded account (same aliases as DEMO_PARTIES, plus the
// verifier and the operator, which act on no aliased record and only need a stable profile id for the session chip).
const PROFILE_ALIASES: Readonly<Record<string, string>> = {
  [DEMO_PARTIES.producer.email]: DEMO_PARTIES.producer.publicId,
  [DEMO_PARTIES.buyer.email]: DEMO_PARTIES.buyer.publicId,
  [DEMO_PARTIES.investor.email]: DEMO_PARTIES.investor.publicId,
  "verificador@agro.dev": "verifier-camila-rojas",
  "fiduciaria@agro.dev": "operator-surco",
  "admin@agro.dev": "operator-surco",
};

export type SessionProfile = { user_id: string; name: string; email: string; role: WebRole; profile_id: string };

export const toSessionProfile = (user: AuthenticatedUser): SessionProfile => ({
  user_id: user.id,
  name: user.name,
  email: user.email,
  role: WEB_ROLES[user.role] ?? "UNKNOWN",
  profile_id: PROFILE_ALIASES[user.email.toLowerCase()] ?? user.id,
});
