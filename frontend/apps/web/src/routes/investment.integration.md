WS1 "investments" - integration notes (investor catalog, investment proposals RF-03, contracts RF-04)

1. ROUTES (apps/web/src/routes.ts)
   Import and spread the fragment INSIDE layout("routes/layout.tsx", [...]):

     import { investmentRoutes } from "./routes/investment.routes";
     ...
     route("buyer/projects/:projectId", "routes/buyer.project.tsx"),
     ...investmentRoutes,
     route("verifier", "routes/verifier.tsx"),

   Paths added (none exists today, no static/dynamic clash):
     /investor                          -> redirects to /investor/projects
     /investor/projects                 (?type=<productionType>)
     /investor/projects/:projectId      (read-only detail + "Enviar propuesta" form)
     /investor/proposals
     /investor/proposals/:proposalId
     /investor/contracts/:contractId
     /producer/proposals
     /producer/proposals/:proposalId
     /producer/contracts/:contractId
   Run `pnpm typecheck` after registering: the ./+types/investment.* imports only resolve once typegen sees the routes.

2. NAV (routes/layout.tsx)
   - investmentNav (routes/investment.nav.ts): groups "Inversor" (Proyectos, Mis propuestas) and "Productor" (Propuestas de inversion).
   - layout.tsx MODULES is hard-coded. Add the investor module so /investor/** is highlighted and PageTitle works:
       { to: "/investor", label: "Inversor", icon: HandCoins },   // lucide-react
     The producer items live under /producer (already a module).
   - Contracts have no list page: they are linked from the proposal detail and from each proposal row.

3. MOCK TRANSPORT (packages/shared/src/modules/presales/infrastructure/mock/transport.ts)
   createInvestmentsMockFetch(base: PresalesMockStore, delegate) is in
   @agro/shared/modules/investments/infrastructure/mock/mock-fetch. It owns ONLY these anchored paths and delegates the rest:
     GET  /investor/catalog                     GET /investor/catalog/:id
     POST /investments/proposals                GET /investments/proposals?investor_id&producer_id&project_id
     GET  /investments/proposals/:id
     POST /investments/proposals/:id/counter
     POST /investments/proposals/:id/revisions/:n/(accept|reject)
     POST /investments/proposals/:id/withdraw
     GET  /contracts/:id                        POST /contracts/:id/sign
   Wire it as the OUTERMOST handler (order is irrelevant for correctness, prefixes are unique; outermost keeps it simple):

     const store = createPresalesMockStore();
     const base = createPresalesMockFetch(store, createPaymentAuthorizationMockFetch(store, createProjectsMockFetch(store, createMockFetch(store.milestones))));
     return createInvestmentsMockFetch(store, base);          // + any other workstream handlers

   It needs the SAME `store` object (reads store.projects, store.externalProjects, store.milestones).
   apps/web/src/investments/module.ts already uses the shared `transport` from ~/platform/transport; no change there.

4. EXISTING FILES: required edits are only the three above (routes.ts, layout.tsx MODULES, mock transport.ts). Nothing else.

5. STATE AND STATUS INTERPLAY
   - Proposals and contracts live in module-local arrays (createInvestmentsState). Nothing is added to shared store types.
   - The ONLY shared write: when BOTH parties have signed, the project's current_status is set to CONTRACT_SIGNED IN PLACE
     (on store.projects or store.externalProjects, whichever holds it), only when it is DRAFT. A project already at
     CONTRACT_SIGNED / FUNDING_IN_PROGRESS stays there (no regression). Other workstreams (grants, funding) can key off CONTRACT_SIGNED.
   - Catalog = every project whose status is DRAFT / CONTRACT_SIGNED / FUNDING_IN_PROGRESS, derived live from the stores
     (producer-created drafts appear automatically). Others (in execution, harvested, settled, cancelled) are hidden and 404.
   - Project producer: mock owner map mirrors presales (ext-sierra-cafe -> producer-sierra, ext-tolima-cacao -> producer-tolima,
     everything else -> producer-main). Keep in sync with presales/infrastructure/mock/fixtures.ts (LOCAL_PRODUCER, projectOwner).
   - Profiles: INVESTOR_PROFILE (apps/web/src/investments/module.ts) = SEED_INVESTOR (investments/infrastructure/mock/state.ts).
     The producer side reuses PRODUCER_PROFILE from ~/producer/presales.

6. SEEDS (investor investor-capital-verde)
   - ip-seed-1: proj-cacao-arauca, PROPOSED 20.000.000 COP at 14 %, waiting for the local producer (producer-main). Try accept/counter at /producer/proposals.
   - ip-seed-2: ext-sierra-cafe, NEGOTIATING, producer countered 13,5 % (turn: investor).
   - ip-seed-3: ext-tolima-cacao (DRAFT), ACCEPTED, contract ic-seed-1 signed by the producer, pending the investor. Investor signs ->
     SIGNED and the project becomes CONTRACT_SIGNED.

7. DOMAIN RULES DECIDED HERE (PRD refs)
   - RF-03: amount is an integer COP, 0 < amount <= project quotation total (sum of milestone budgets via projectQuotationTotal with no agreed
     prices); it MAY be less than the total (single investor; multi-investor split is RF-23, out of scope).
     Yield is integer basis points (1450 = 14,5 %), 0 < yield <= 50 %, form accepts "12", "12,5", "12.25".
     validUntil >= today. Notes <= 500. A counter must change amount or yield. Turn-based: the non-author of the latest SENT revision acts.
     Lazy expiry (validUntil < today -> EXPIRED), never stored. Statuses are strings with UNKNOWN fallback in the mapper.
     Producer never starts a proposal; only the investor withdraws (producer rejects on their turn).
     One live proposal per investor and project; an accepted proposal locks the project and auto-closes rival live proposals.
   - RF-04 / D-04: acceptance by either side generates the contract from a template (parties, project, amount, yield, milestones with caps,
     liquidation order: platform fee, investor capital, agreed yield, producer net as remainder; investor bears the loss if the sale falls short).
     SHA-256 of the canonical document (crypto.subtle, pure-JS fallback with identical output, verified against node:crypto). Two separate
     signatures with timestamps; contract SIGNED when both exist.

8. OPEN DECISIONS
   - Should signing also be required before the grant of milestone 1 is requested? (Not enforced here: the status flag is the hand-off.)
   - Platform fee base in the liquidation clause is stated as "X % according to the project's fee"; the PRD does not define the base.
   - The project quotation total uses milestone budgets only (buyer-agreed prices from the presales flow are not applied for investors).
