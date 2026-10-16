import type { Role } from "./role";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

// Framework-agnostic view of the incoming request headers (the session cookie lives in here).
export type RequestHeaders = Record<string, string | string[] | undefined>;

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class SessionResolver {
  abstract resolve(headers: RequestHeaders): Promise<AuthenticatedUser | null>;
}
