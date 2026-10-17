WS3 payment lines (prefix split) - integration notes

1. ROUTES (routes.ts)
   import { splitRoutes } from "./routes/split.routes";
   ...and spread inside layout("routes/layout.tsx", [ ... ,  ...splitRoutes ]).
   URLs:
     /producer/suppliers                         suppliers registry (list + create)
     /producer/lines/example                     PRD worked example (EUR 1,000.00 -> 950 / 3 / 953 / 47)
     /producer/projects/:projectId/lines         every milestone of a project with cap, line count, sums
     /producer/milestones/:milestoneId/lines     lines table, add/edit/remove form, summary aside
   None of them collides with routes.ts (producer/milestones/:milestoneId stays untouched).

2. NAV (routes/layout.tsx)
   import { splitNav } from "./split.nav";  -> one item: { label "Proveedores", to "/producer/suppliers", icon "Truck", group "Productor" }.
   The lucide icon name must be mapped by the integrator (Truck).
   Link targets for other pages (not edited by this workstream):
     - producer.project.tsx header:  <Link to={`/producer/projects/${project.id}/lines`}>Líneas de pago</Link>
     - producer.milestone.tsx:       <Link to={`/producer/milestones/${milestone.id}/lines`}>Líneas de pago</Link>
     - example page:                 /producer/lines/example

3. MOCK HANDLER (platform/transport.ts or presales mock transport chain)
   import { createPaymentLinesMockFetch } from "@agro/shared/modules/payment-lines/infrastructure/mock/mock-fetch";
   Chain it once with the SAME base store the other handlers receive:
     const lines = createPaymentLinesMockFetch(store, delegateFetch);
   Order: anywhere before the final 404/fallback; all its paths are anchored and unique, it falls through (delegate)
   for everything else. Endpoints:
     GET  /wallet-validation?url=                 -> {exists, asset_code, asset_scale, public_name} | 400 {errors:{walletAddress:[..]}}
     GET  /suppliers        POST /suppliers       -> 201 supplier | 400 | 409 (duplicate wallet)
     GET  /milestone-lines?milestone_id=          -> {milestone:{id,project_id,sequence_order,title,cap,currency,scale}, lines:[..]} | 404
     POST /milestone-lines                        -> 201 line | 400 (cap exceeded: errors.amount) | 409 (duplicate invoice, closed milestone)
     PATCH/DELETE /milestone-lines/:lineId        -> 200 | 404 | 409 (line not pending)
     POST /milestone-lines/:lineId/mark-paid      -> 200 line with status COMPLETED + receipt_id (idempotent)
     GET  /projects/:projectId/milestone-lines    -> {project, milestones:[{milestone, lines}]} | 404
   State is module-local (createPaymentLinesState). The base store is only READ (projects, externalProjects, milestones).
   Wallet validation rules (mock): only hosts ilp.interledger-test.dev, wallet.interledger-test.dev, eu1.fynbos.dev;
   last path segment "no-existe*"/"missing*" -> exists:false; ending in -usd/-eur -> other currency ("La wallet usa otra moneda"); else COP.

4. HOOK FOR OTHER FLOWS
   When the outgoing payment of a line is confirmed call POST /milestone-lines/:lineId/mark-paid
   (or producerLines.markLinePaid(lineId) from ~/payment-lines/module). Failed/queued lines are only seeded; there is no endpoint
   to set them (add one if the payment flow needs it).

5. SEEDS
   4 suppliers (all VALIDATED). Lines for ms-01 (cap 5,000,000: two same-supplier invoices that consolidate, a 30% labor line)
   and ms-02 (cap 6,900,000: pending, failed, queued and a fixed labor line) of proj-finca-la-esperanza.
   Milestone cap = supplies_budget + labor_budget of the shared milestone; scale 0; commission COP 0 (COMMISSION_PER_PAYMENT).

6. NO EDITS TO EXISTING FILES REQUIRED beyond the three above (routes.ts, layout nav, transport chain).

7. OPEN DECISIONS
   - Percent lines are a share of the milestone cap (basis points); leftover cents go to the producer line.
   - Failed lines still count toward the cap (they can be retried).
   - Producer beneficiary is the fixed profile (producer-main) with a fixed wallet in domain/line.ts.
   - A "Líneas de pago" button on producer.project.tsx / producer.milestone.tsx is left to the integrator.

8. PRD ENGINE GAPS (RF-01, RF-21/D-05, D-06, RF-11/RF-07, D-08)
   - RF-01 producer wallet: the project form requires "Billetera del productor" and validates it through GET /wallet-validation (inline
     "Billetera validada: COP, escala 0"; the creation validates again before saving). Stored as `producer_wallet` on the project (optional).
     The producer beneficiary of the lines, the payout receipt and the producer payment use it; projects without it fall back to the
     fixed profile wallet (domain/line.ts).
   - RF-21 / D-05 contingency: `contingency_bps` on the project (form: "Fondo de imprevistos (%)", integer 0-20, default 5, optional on the wire).
     Reserve per milestone = floor(budget * bps / 10000), INSIDE the cap. split.ts: ordinary lines (Σ recibe + comisiones) must fit in
     `cap - reserve`; only lines of concept `imprevisto` draw from the reserve (never consolidated with other lines). Producer lines page:
     card "Fondo de imprevistos" (reserva / usado / disponible) and "Solicitar fondos de imprevistos" (use case requestContingencyFunds ->
     POST /milestone-lines concept imprevisto, moment insumos). The engine pays it through the active grant like any insumos line (fila 6).
   - D-06 platform commission PER MILESTONE: planned automatically as a non-editable line `Comisión de la plataforma` (concept `comision`,
     beneficiary PLATFORM = PLATFORM_IDENTITY wallet, amount = floor(budget * platform_fee_pct), 2.00 % by default, moment `aprobacion`),
     created lazily (id ln-fee-<milestoneId>) when the lines of a milestone are read. It counts in the cap, is paid by the engine on the
     favorable dictamen together with the producer line (fila 12) and appears as a receipt of the grant. Applies to projects that registered a
     producer wallet (new projects); seeds and projects created without one keep their lines untouched.
     NOTE: phase 4 (harvest liquidation) keeps its own 2.00 % fee charged on the ORDER total, as the PRD's liquidation order says
     (harvest.integration.md). D-06 charges per milestone, phase 4 charges on the order: they are two different fees on purpose.
   - RF-11 retries: a network/5xx failure of the wallet queues the line (`en_cola`), records the attempt in the line history and schedules the
     next attempt with exponential backoff (30 s, 1, 2, 4, 8 min; max 5 attempts, then `fallido`). No timers: the bridge evaluates the due
     retries lazily when the lines are read and on every payment trigger. Business errors (GRANT_LIMIT_EXCEEDED, revoked grant) mark the
     line `fallido` and are never retried automatically. "Reintentar pago" -> POST /milestone-lines/:id/retry {milestone_id} (handled by the
     bridge); idempotent by `milestone:line` (a paid line answers 409 and the grant replays the existing receipt). The grant of a completed
     milestone is revoked only when no line is `en_cola` or `fallido`, so the retries can still use it.
     New endpoint of the lines mock: POST /milestone-lines/:id/attempt {retryable, code, message, manual}.
   - Mock-only failure injection: header `x-mock-fail: network | server | token-expired` on any request that triggers a payment (it is
     forwarded to the grants spend handler by the bridge). network/server -> 503 and nothing is paid (event PAYMENT_FAILED in the grant
     timeline); token-expired -> the spend rotates the token and retries once (event TOKEN_ROTATED, already shown in the grant timeline, RF-07).
   - D-08: no automatic revocation on the deadline. A "Plazo vencido" warning badge shows on the milestone, its lines page, the grant row and
     the grant detail when the estimated completion date passed without a favorable dictamen; the manual revoke action stays.
