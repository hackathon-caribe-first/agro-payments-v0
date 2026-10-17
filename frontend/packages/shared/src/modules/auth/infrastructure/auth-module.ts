import { getSession, listProfiles, signIn, signOut, type AuthDeps } from "../application/use-cases";
import type { AuthRepository } from "../application/auth-repository";
import { HttpAuthRepository } from "./http-auth-repository";
import { MockAuthRepository } from "./mock/mock-auth-repository";
import { createSessionStore, type SessionStore } from "./mock/session-store";

interface Options {
  store?: SessionStore;
  // "http": Better Auth on our backend (POST /auth/sign-in/email, GET /users/me, POST /auth/sign-out). Anything else: the mock.
  source?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

const DEFAULT_BASE_URL = "/api";

// Binds every auth use case to one repository: HttpAuthRepository in http mode, MockAuthRepository otherwise.
export function createAuthModule({ store = createSessionStore(), source, baseUrl = DEFAULT_BASE_URL, fetchFn }: Options = {}) {
  const auth: AuthRepository =
    source === "http" ? new HttpAuthRepository({ baseUrl, fetchFn: fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args)) }) : new MockAuthRepository({ store });
  const deps: AuthDeps = { auth };
  return {
    getSession: () => getSession(deps),
    listProfiles: () => listProfiles(deps),
    signIn: (raw: unknown) => signIn(deps, raw),
    signOut: () => signOut(deps),
  };
}

export type AuthModule = ReturnType<typeof createAuthModule>;
