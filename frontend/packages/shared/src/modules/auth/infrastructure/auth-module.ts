import { getSession, listProfiles, signIn, signOut, type AuthDeps } from "../application/use-cases";
import { MockAuthRepository } from "./mock/mock-auth-repository";
import { createSessionStore, type SessionStore } from "./mock/session-store";

interface Options {
  store?: SessionStore;
}

// Binds every auth use case to one repository. Swap MockAuthRepository for an HTTP adapter (Better Auth, /users/me) here.
export function createAuthModule({ store = createSessionStore() }: Options = {}) {
  const deps: AuthDeps = { auth: new MockAuthRepository({ store }) };
  return {
    getSession: () => getSession(deps),
    listProfiles: () => listProfiles(deps),
    signIn: (raw: unknown) => signIn(deps, raw),
    signOut: () => signOut(deps),
  };
}

export type AuthModule = ReturnType<typeof createAuthModule>;
