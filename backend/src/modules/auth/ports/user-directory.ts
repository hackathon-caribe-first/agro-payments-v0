import type { AuthenticatedUser } from "./session-resolver";

// Read-only lookup of existing users. Better Auth owns the user table; this never creates or changes users.
export abstract class UserDirectory {
  abstract findByEmail(email: string): Promise<AuthenticatedUser | null>;
}
