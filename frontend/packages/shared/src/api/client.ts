import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type Milestone = components["schemas"]["MilestoneDto"];

export const api = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3000",
  credentials: "include", // Better Auth session cookie
});
