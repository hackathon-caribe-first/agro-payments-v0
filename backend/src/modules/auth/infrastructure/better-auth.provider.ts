import type { Provider } from "@nestjs/common";
import { loadEnv } from "../../../shared/config/env";
import { type BetterAuthInstance, createBetterAuth } from "./better-auth.factory";

export const BETTER_AUTH = Symbol("BETTER_AUTH");

export const betterAuthProvider: Provider<BetterAuthInstance> = {
  provide: BETTER_AUTH,
  useFactory: () => createBetterAuth(loadEnv()),
};
