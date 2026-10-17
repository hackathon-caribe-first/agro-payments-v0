import { PARTY_SIDE, type PartySide } from "../../auth/application/demo-parties";

// THE rule for which demo user an /api request without a session acts as (DEMO_IDENTITY=true only; see DEMO_PARTIES).
// It never authorizes anything: the service checks the resolved user against the negotiation, and a real session always wins.
//   buyer     catalog, POST /projects/:id/negotiations, /buyers/:id/*, cancel, deposit, POST /open-requests, close
//   producer  GET /producer/quote-requests, decline, POST /open-requests/:id/negotiations
//   by body   POST quotes → `author` (default PRODUCER); accept / reject / withdraw → `actor` (default BUYER): the app's own defaults
//   either    GET /quote-requests/:id, GET /open-requests*, the escrow ledger: both demo users are tried (ResolveApiUserUseCase.candidates)
export function sideOf(party: unknown, fallback: "BUYER" | "PRODUCER"): PartySide {
  return (typeof party === "string" ? party : fallback) === "PRODUCER" ? PARTY_SIDE.PRODUCER : PARTY_SIDE.BUYER;
}

/** The `author` / `actor` field of a body, if it has one (only to pick the demo side). */
export const partyField = (body: unknown, key: "author" | "actor"): unknown =>
  typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
