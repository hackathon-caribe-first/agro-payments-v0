import { route, type RouteConfigEntry } from "@react-router/dev/routes";

// Operations & transparency area: investor panel, reconciliation, trace, audit trail and the notifications center.
// Spread INSIDE the layout("routes/layout.tsx", [...]) children of routes.ts. Static before dynamic.
export const opsRoutes: RouteConfigEntry[] = [
  route("investor/panel", "routes/panel.investor.tsx"),
  route("ops/reconciliation", "routes/ops.reconciliation.tsx"),
  route("ops/trace", "routes/ops.trace.tsx"),
  route("notifications", "routes/ops.notifications.tsx"),
  route("producer/projects/:projectId/audit", "routes/audit.producer-project.tsx"),
  route("investor/projects/:projectId/audit", "routes/audit.investor-project.tsx"),
];
