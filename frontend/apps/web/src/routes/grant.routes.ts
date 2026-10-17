import { route, type RouteConfigEntry } from "@react-router/dev/routes";

// Investor grant routes. Spread these INSIDE layout("routes/layout.tsx", [...]) in routes.ts (static before dynamic).
export const grantRoutes: RouteConfigEntry[] = [
  route("investor/grants", "routes/grant.list.tsx"),
  route("investor/grants/:grantId", "routes/grant.detail.tsx"),
  route("investor/grants/:grantId/approve", "routes/grant.approve.tsx"),
  route("investor/projects/:projectId/grants", "routes/grant.project.tsx"),
];
