WS2 "grants" - integration notes (investor-facing grant lifecycle per milestone)

1) ROUTES TO REGISTER (routes.ts, inside layout("routes/layout.tsx", [...]))
   import { grantRoutes } from "./routes/grant.routes";   // path relative to routes.ts: "./routes/grant.routes"
   ...spread `...grantRoutes,` next to the other role areas.
   URLs: /investor/grants, /investor/grants/:grantId, /investor/grants/:grantId/approve, /investor/projects/:projectId/grants
   Route files: routes/grant.list.tsx, grant.detail.tsx, grant.approve.tsx, grant.project.tsx
   Typegen: the `./+types/grant.*` imports only resolve after the routes are registered and `react-router typegen` runs
   (typecheck errors on those 4 imports, and the implicit-any that cascade from them, are expected until then).

2) NAV
   import { grantNav } from "./grant.nav" -> [{ label: "Mis grants", to: "/investor/grants", icon: "KeyRound", group: "Inversor" }]
   layout.tsx MODULES is a flat list today: add { to: "/investor/grants", label: "Inversor", icon: KeyRound } (or the grouped nav).
   PageTitle/active-state work with pathname.startsWith("/investor/").

3) MOCK HANDLER TO CHAIN
   createGrantsMockFetch(base: PresalesMockStore, delegate: typeof fetch) in
   packages/shared/src/modules/grants/infrastructure/mock/mock-fetch.ts
   Edit packages/shared/src/modules/presales/infrastructure/mock/transport.ts, e.g. outermost:
     import { createGrantsMockFetch } from "../../../grants/infrastructure/mock/mock-fetch";
     return createGrantsMockFetch(store, createPresalesMockFetch(store, createPaymentAuthorizationMockFetch(...)));
   Order is free: every path is anchored and unique to this module:
     GET  /investors/:id/grants
     GET|POST /projects/:id/grants   (GET takes ?investor_id=)
     GET  /grants/:id
     POST /grants/:id/{interact|continue|deny|spend|rotate-token|revoke}
   It must receive the SAME `store` object (it reads store.projects/externalProjects/milestones). State lives in the closure
   (createGrantsState), so create the handler once per transport.
   Composition root for the pages: apps/web/src/grants/module.ts (uses the shared `transport`; exports `investor`, INVESTOR_PROFILE).
   INVESTOR_PROFILE = INVESTOR_IDENTITY ({ id: "investor-capital-verde", wallet: "https://wallet.example/capital-verde" }) and the mock seeds use the same id.

4) EDITS TO EXISTING FILES: none required beyond routes.ts, layout nav and transport chain above.

5) SEEDS (reuse existing ids, caps = supplies_budget + labor_budget of the milestone)
   - ms-41 (proj-platano-meta, hito 1): ACTIVE, cap 5.800.000, 2 receipts (spent 2.750.000), token already expired -> the next spend
     rotates it once (TOKEN_ROTATED) and retries.
   - ms-31 (proj-panela-cundinamarca, hito 1): REVOKED (LAST_LINE_CONFIRMED), cap 6.800.000, spent 6.650.000, proof: 150.000 stay in wallet, DELETE 204.
   - ms-11 (proj-cacao-arauca, hito 1): PENDING_APPROVAL, cap 6.500.000. Approving it triggers the status interplay below.
   - proj-finca-la-esperanza ms-01: no grant -> eligible, use the "Solicitar grant del hito" button on /investor/projects/proj-finca-la-esperanza/grants.

6) STATUS INTERPLAY (APPLIED, in place, only here)
   On the first approved grant of milestone 1 (continue succeeds): if the project is FUNDING_IN_PROGRESS it becomes FUNDED_IN_CUSTODY
   (UI label "Cotización aprobada"), and milestone 1 LOCKED -> ACTIVE. Implemented in grants/infrastructure/mock/state.ts
   applyFirstApprovalInterplay (mutates store.projects[i].current_status and store.milestones[i].status; arrays never replaced).
   Revocation does NOT touch project/milestone status. If the integrator prefers not to mutate, delete that one function call.

7) RULES IMPLEMENTED (server in the mock, mirrored in domain/grant-rules.ts for the UI)
   - One live (PENDING_APPROVAL|ACTIVE) grant per milestone+investor -> 409 LIVE_GRANT_EXISTS.
   - Grant N+1 only after grant N is REVOKED -> 409 PREVIOUS_GRANT_NOT_REVOKED. A revoked/paid milestone -> 409 MILESTONE_CLOSED.
   - cap = milestone budget, no interval. Spend that does not fit -> 409 GRANT_LIMIT_EXCEEDED (+ `remaining`), logged as PAYMENT_REJECTED.
   - Token expiry is separate: spend rotates the token (TOKEN_ROTATED, retried once) and continues; manual POST /grants/:id/rotate-token.
   - Idempotency key `milestone:line`: repeated POST /grants/:id/spend returns 200 {receipt, replayed:true}, never a second payment (also after revocation).
   - Revocation (4 reasons: LAST_LINE_CONFIRMED, MILESTONE_CANCELLED, DEADLINE_EXPIRED, SECURITY_INCIDENT): DELETE 204 proof {cap, spent,
     remaining_in_wallet}, tokens cleared, audit REVOKED + REVOCATION_VERIFIED; any later spend -> 409 GRANT_REVOKED.
   - Approval = POST interact (wallet consent -> interact_ref + hash) then POST continue (hash verified with and without trailing "/").
     Both calls are one use case (approveMilestoneGrant). interact with account_confirmed=false answers 409 WALLET_ACCOUNT_MISMATCH
     ("Access to the given resource is forbidden"), the PoC lesson.

8) HOW OTHER FLOWS PAY A LINE
   import { investor } from "~/grants/module"; investor.spend(grantId, { lineId, concept, beneficiary, beneficiaryWallet, received, fee? })
   -> Result<{ receipt, replayed }, GrantError>. No investor-facing UI triggers payments (the platform does).

9) OPEN DECISIONS
   - Revocation is offered to the investor with all four reasons; in production "last line confirmed" / "deadline" are platform-triggered.
   - Fee model: 0 in COP, 100 minor units in EUR (domain/grant-rules.ts estimatedFee).
   - Project list on /investor/grants shows every local project with milestones (no per-investor funding relation exists yet).
   - Not covered: contract/certificate emission after first grant (Phase 2 step 4), purchase-order grant of the final buyer (RF-16).
