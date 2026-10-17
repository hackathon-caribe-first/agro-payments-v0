import { route, type RouteConfigEntry } from "@react-router/dev/routes";

// Payment lines (split of each milestone). Spread these INSIDE layout("routes/layout.tsx", [...]) of routes.ts.
// Static segments come before dynamic ones.
export const splitRoutes: RouteConfigEntry[] = [
  route("producer/suppliers", "routes/split.suppliers.tsx"),
  route("producer/lines/example", "routes/split.example.tsx"),
  route("producer/projects/:projectId/lines", "routes/split.project-lines.tsx"),
  route("producer/milestones/:milestoneId/lines", "routes/split.milestone-lines.tsx"),
];
