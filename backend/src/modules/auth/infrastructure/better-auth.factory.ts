import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { Pool } from "pg";
import type { Env } from "../../../shared/config/env";
import { isSelfSelectableRole } from "../ports/role";

// Kept free of Nest decorators so the Better Auth CLI can load it (see better-auth.cli.ts).
export function createBetterAuth(env: Env, database: Pool = new Pool({ connectionString: env.databaseUrl })) {
  return betterAuth({
    database,
    secret: env.betterAuthSecret,
    baseURL: env.apiUrl,
    trustedOrigins: env.webOrigins,
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        // input: true lets sign-up send it; the hooks below decide which values are acceptable.
        role: { type: "string", required: true, input: true },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Sign-up only accepts the self-selectable roles, so admin/fidu can never be claimed publicly.
          before: async (user) => {
            if (!isSelfSelectableRole(user.role)) {
              throw new APIError("BAD_REQUEST", { message: "Invalid role" });
            }
          },
        },
        update: {
          // Covers /update-user and any other public path: roles change only through UserRoleWriter.
          before: async (data) => {
            if ("role" in data) throw new APIError("BAD_REQUEST", { message: "Role cannot be changed here" });
          },
        },
      },
    },
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
