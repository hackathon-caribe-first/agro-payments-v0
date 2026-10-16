import { loadEnv } from "../../../shared/config/env";
import { createBetterAuth } from "./better-auth.factory";

// Entry point for the Better Auth CLI (`pnpm auth:migrate`); it looks for an `auth` export.
export const auth = createBetterAuth(loadEnv());
