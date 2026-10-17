import { route, type RouteConfigEntry } from "@react-router/dev/routes";

// Supplier area (role SUPPLIER). Spread INSIDE layout("routes/layout.tsx", [...]) of routes.ts.
export const supplierRoutes: RouteConfigEntry[] = [route("supplier", "routes/supplier.payments.tsx")];
