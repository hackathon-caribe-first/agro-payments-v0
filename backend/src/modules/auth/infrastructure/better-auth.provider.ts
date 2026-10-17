import { Logger, type Provider } from "@nestjs/common";
import { getMigrations } from "better-auth/db";
import { Pool } from "pg";
import { loadEnv } from "../../../shared/config/env";
import { type BetterAuthInstance, createBetterAuth } from "./better-auth.factory";

export const BETTER_AUTH = Symbol("BETTER_AUTH");

export const betterAuthProvider: Provider<BetterAuthInstance> = {
  provide: BETTER_AUTH,
  useFactory: async () => {
    const env = loadEnv();
    const pool = new Pool({ connectionString: env.databaseUrl });
    const auth = createBetterAuth(env, pool);
    if (process.env.AUTH_MIGRATE_ON_START === "true") {
      const logger = new Logger("BetterAuthMigration");
      try {
        const { runMigrations } = await getMigrations(auth.options);
        await runMigrations();
        logger.log("Better Auth database schema is ready");
      } catch (error) {
        logger.error("Better Auth schema migration failed", error instanceof Error ? error.stack : String(error));
        await pool.end();
        throw error;
      }
    }
    return auth;
  },
};
