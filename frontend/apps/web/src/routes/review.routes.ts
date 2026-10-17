import { route, type RouteConfigEntry } from "@react-router/dev/routes";

// Spread INSIDE the layout("routes/layout.tsx", [...]) children of routes.ts. Static before dynamic.
// Does not collide with the existing `route("verifier", "routes/verifier.tsx")`: these are nested, longer paths.
export const reviewRoutes: RouteConfigEntry[] = [
  route("verifier/reviews", "routes/review.queue.tsx"),
  route("verifier/reviews/:milestoneId", "routes/review.detail.tsx"),
  route("verifier/notifications", "routes/review.notifications.tsx"),
];
