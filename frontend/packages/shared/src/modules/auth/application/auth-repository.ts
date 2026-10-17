import type { Role, Session } from "../domain/role";
import type { SignInInput } from "../schemas/sign-in";

export interface ProfileOption {
  profileId: string;
  name: string;
  email: string;
  role: Role;
}

// The port. The mock adapter backs it with a local directory; a real one talks to the backend (Better Auth, /users/me).
export interface AuthRepository {
  getSession(): Promise<Session | null>;
  // Throws ValidationFailure (fields `email`, `profileId`) when the credentials do not match an account.
  signIn(input: SignInInput): Promise<Session>;
  signOut(): Promise<void>;
  // The profiles that can be picked on the sign-in page.
  listProfiles(): Promise<ProfileOption[]>;
}
