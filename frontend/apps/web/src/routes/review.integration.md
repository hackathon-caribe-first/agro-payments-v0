WS4 "verification" (prefix review) - integration notes

1. ROUTES (routes.ts)
   import { reviewRoutes } from "./routes/review.routes";
   Spread inside the layout("routes/layout.tsx", [...]) children, e.g. right after route("verifier", "routes/verifier.tsx"):
     ...reviewRoutes,
   Paths: /verifier/reviews, /verifier/reviews/:milestoneId, /verifier/notifications (optional ?role=PRODUCER|INVESTOR).
   routes/verifier.tsx (upstream, real backend) is untouched; no path collision (these are longer, nested paths).
   Until the routes are registered, `react-router typegen` has no ./+types/review.* modules, so typecheck on review.queue/detail/
   notifications.tsx reports TS2307 (expected, resolves once registered).

2. NAV (routes/layout.tsx)
   import { reviewNav } from "./review.nav";  group "Verificador": "Verificaciones" (/verifier/reviews, ClipboardCheck),
   "Notificaciones" (/verifier/notifications, Bell). Layout was NOT edited.
   Optional unread badge: `loadUnreadCount(role)` in ~/reviews/notifications and <NotificationBadge count /> in
   ~/components/review/notification-badge. Other roles can link to /verifier/notifications?role=PRODUCER or ?role=INVESTOR, or
   reuse <NotificationList notifications role /> (needs a route action handling intents `read` and `read-all`; see review.notifications.tsx).

3. MOCK HANDLER CHAIN (packages/shared/src/modules/presales/infrastructure/mock/transport.ts)
   createReviewsMockFetch(store, delegate) from "../../../reviews/infrastructure/mock/mock-fetch".
   It only answers anchored /reviews/** and /notifications/**; everything else goes to `delegate`, so ANY position works.
   Recommended: wrap the milestones/projects handlers, i.e. createReviewsMockFetch(store, <rest of the chain>).
   It needs the same PresalesMockStore (reads store.projects, store.externalProjects, store.milestones by reference).
   Module-level seed runs when the handler is created (see 5).
   Endpoints:
     GET  /reviews/queue?verifier_id=&tab=pending|changes|decided
     GET  /reviews/:milestoneId?verifier_id=              (milestone detail + assignment + audit history + photo GPS + payout)
     POST /reviews/:milestoneId/dictamen                  (201 entry | 400 field errors | 409 not assigned / wrong status)
     POST /reviews/:milestoneId/confirm-payout            (201 receipt | 409 not pending / no signed approval)
     GET  /reviews/outbox                                 (events for the integrator)
     GET  /notifications?role=PRODUCER|VERIFIER|INVESTOR ; POST /notifications/:id/read ; POST /notifications/read-all?role=
   Composition root for pages: apps/web/src/reviews/module.ts (uses the shared `transport`; no change needed once chained).

4. EXISTING FILES TO EDIT: only routes.ts, layout.tsx (nav) and presales/infrastructure/mock/transport.ts as above.

5. SEED / STATUS INTERPLAY (documented in-place mutations of store.milestones, done once at handler creation)
   - ms-01 is already SUBMITTED_FOR_REVIEW in fixtures. If fewer than 2 reviewable milestones exist in the assigned projects, IN_FIELD_EXECUTION
     milestones (ms-03) get the missing evidence logged (log id log-seed-<id>) and a SUBMITTED review, then status SUBMITTED_FOR_REVIEW.
   - TECHNICALLY_APPROVED fixtures (ms-33) get a signed audit entry for their existing approval and move to LABOR_PAYOUT_PENDING
     (outbox PAY_PRODUCER_LINE queued), so confirm-payout can be exercised.
   - Assignment: the fixed VERIFIER profile (verifier-camila-rojas) covers all local projects; ext-* projects belong to another
     verifier (409 when the fixed verifier tries to rule on them).
   - Dictamen writes (in place): milestone.status, a review row (APPROVED_FAVORABLE | CHANGES_REQUESTED | PAYOUT_EXECUTED) so the
     producer's reviews history shows the verifier's comment (observed: comment + "Subsanaciones: 1) ..."), labor_executed on payout,
     and next milestone LOCKED -> ACTIVE on COMPLETED_AND_PAID. The producer re-submits through the existing /milestones/:id/submit.
   - Rich audit entries (actor, role, from/to, technical_evaluation_json, evidence_snapshot_json, signature_hash) live in the
     module-local state and are merged with milestone.reviews by id for the verifier detail page.
   - Outbox events: PAY_PRODUCER_LINE (amount = labor_budget), REVOKE_MILESTONE_GRANT, REQUEST_NEXT_MILESTONE_GRANT (next_milestone_id).
     Nothing else is called from here: the integrator/payments workstream consumes GET /reviews/outbox.
   - Notifications: producer "Hito observado" / "Hito aprobado" / "Hito completado y pagado", investor same, verifier "Nueva verificación"
     (derived from SUBMITTED_FOR_REVIEW milestones on every queue/notification read, so producer re-submissions are picked up
     without hooking the milestones handler).

6. OPEN DECISIONS
   - Photo GPS/precision are derived deterministically per photo URL in the mock (the evidence payload carries only URLs); a real
     backend should return capture metadata.
   - Who triggers confirm-payout: exposed as a button in the verifier detail (status LABOR_PAYOUT_PENDING) and as an endpoint; the
     payments workstream may call POST /reviews/:id/confirm-payout when its producer payout line is confirmed instead.
   - Investor notifications have no href (no investor milestone page known at build time).
   - Commission outgoing payment of the milestone (PRD request #12, D-06) is not modelled here.
