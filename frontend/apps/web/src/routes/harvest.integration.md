WS5 "harvest & liquidation" (prefix harvest) - integration notes

1) ROUTES (routes.ts)
   import { harvestRoutes } from "./routes/harvest.routes";
   and spread `...harvestRoutes` inside the layout("routes/layout.tsx", [...]) children.
   URLs: /producer/orders, /producer/orders/:orderId, /producer/projects/:projectId/harvest,
   /producer/projects/:projectId/settlement, /verifier/harvests, /verifier/harvests/:batchId,
   /buyer/marketplace (?type=Café), /buyer/marketplace/:batchId, /buyer/orders, /buyer/orders/:orderId,
   /buyer/orders/:orderId/authorize, /investor/settlements, /investor/settlements/:projectId.
   No path collides with routes.ts today. Run typegen after registering: the route files import ./+types/harvest.*.
   NOTE: /verifier and /investor index pages are owned elsewhere.

2) NAV (layout.tsx): import { harvestNav } from "./harvest.nav" (label/to/icon/group, lucide names:
   PackageCheck, Wheat, Store, ClipboardList, BadgeCheck, Landmark). The "Cosecha" item points at /producer because the
   declaration page is per project: ALSO add a link "Declarar cosecha" to /producer/projects/:id/harvest in the producer
   project page (producer.project.tsx), shown when project.currentStatus is IN_EXECUTION / FUNDED_IN_CUSTODY /
   HARVEST_DECLARED / LISTED_IN_MARKET / SETTLED_AND_CLOSED (the page itself explains blockers).

3) MOCK HANDLER (packages/shared/src/modules/presales/infrastructure/mock/transport.ts, createAppMockTransport):
   import { createHarvestMockFetch } from "../../../harvest/infrastructure/mock/mock-fetch";
   Wrap it OUTSIDE the existing chain (it only answers /harvest/**, /marketplace/**, /orders*, /settlements*; everything else
   goes to `delegate`):
     return createHarvestMockFetch(store, createPresalesMockFetch(store, ...existing...));
   (or any position; paths are anchored and unique). It needs the same `store` (projects + milestones arrays).
   apps/web/src/harvest/module.ts uses the shared `transport`, no change needed once chained.

4) STATUS INTERPLAY (in-place mutation of store.projects[].current_status, nothing else is touched)
   declare -> HARVEST_DECLARED (only if IN_EXECUTION|FUNDED_IN_CUSTODY and ALL milestones COMPLETED_AND_PAID, else 409)
   certify -> HARVEST_CERTIFIED then LISTED_IN_MARKET; request corrections keeps HARVEST_DECLARED
   authorize order payment -> MARKET_PAYMENT_HELD (wire name only; UI says "pago autorizado")
   confirm reception -> DELIVERED_TO_BUYER -> SETTLEMENT_PROCESSING -> SETTLED_AND_CLOSED (lot sold out) or LISTED_IN_MARKET
   Seeded lots/orders for projects not in store.projects (proj-mango-sinu, proj-cacao-huila, proj-cafe-nevada) skip the
   status write. Existing projects used by seeds: proj-aguacate-tolima (settled), proj-panela-cundinamarca (batch in
   the verifier queue, project already HARVEST_DECLARED).
   Declaring on proj-finca-la-esperanza is blocked until its milestones are paid (the checklist is shown) - reachable via
   the existing milestone flow.

5) SEEDS (infrastructure/mock/fixtures.ts)
   hb-1004 Café LISTED free lot (marketplace) | hb-1002 Mango + ord-1002 PAYMENT_AUTHORIZED awaiting dispatch |
   hb-1003 Cacao + ord-1003 DISPATCHED, LOSS scenario (sale 12.000.000 < capital 14.000.000 + yield 16%) |
   hb-1001 Aguacate + ord-1001 SETTLED (fee 640.000, capital 24.000.000, yield 2.880.000, producer net 4.480.000) |
   hb-1005 Panela DECLARED (verifier queue). Investment terms (capital, yield %) come from INVESTMENT_TERMS in fixtures.ts,
   falling back to project target_amount / investor_roi_pct for projects not listed.

6) FIXED PROFILES: producer = PRODUCER_PROFILE (producer/presales.ts), buyer = BUYER_PROFILE (buyer/module.ts),
   verifier-camila-rojas, investor-capital-verde (harvest/module.ts).

7) OPEN DECISIONS
   - Platform fee for liquidation is 2.00% (200 bp, order.platformFeeBp), independent of the project platform_fee_pct (3, hito commission).
   - One open order per lot at a time (409 otherwise); capital/yield outstanding are frozen on the order and decremented on settlement;
     a loss is final (D-04), outstanding goes to 0.
   - ProjectStatusBadge labels MARKET_PAYMENT_HELD as "Pago retenido": consider renaming it to "Pago autorizado" (no custody wording).
   - RF-22 PDF export is out of scope (statements are display only).
