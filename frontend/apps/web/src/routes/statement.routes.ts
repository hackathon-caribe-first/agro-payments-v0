import { route, type RouteConfigEntry } from "@react-router/dev/routes";

// RF-22: the producer's final statement and the investor's balance (document page, PDF and print).
export const statementRoutes: RouteConfigEntry[] = [
  route("producer/projects/:projectId/statement", "routes/statement.producer.tsx"),
  route("investor/projects/:projectId/statement", "routes/statement.investor.tsx"),
  route("investor/settlements/:projectId/statement", "routes/statement.investor.tsx", { id: "statement-investor-settlement" }),
];
