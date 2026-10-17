import { ValidationFailure } from "../../../milestones/domain/errors";
import type { AuthRepository, ProfileOption } from "../../application/auth-repository";
import type { Session } from "../../domain/role";
import type { SignInInput } from "../../schemas/sign-in";
import type { SessionDto } from "../dto";
import { toSession } from "../mapper";
import { MOCK_ACCOUNTS } from "./directory";
import type { SessionStore } from "./session-store";

interface Options {
  store: SessionStore;
  accounts?: readonly SessionDto[];
}

export const EMAIL_MISMATCH = "Este correo no corresponde al perfil seleccionado.";
export const PROFILE_UNKNOWN = "Selecciona tu perfil para entrar.";

export class MockAuthRepository implements AuthRepository {
  private readonly store: SessionStore;
  private readonly accounts: readonly SessionDto[];

  constructor({ store, accounts = MOCK_ACCOUNTS }: Options) {
    this.store = store;
    this.accounts = accounts;
  }

  // The stored value is only an account id: the role always comes from the directory, so editing storage grants nothing.
  async getSession(): Promise<Session | null> {
    const userId = this.store.read();
    const account = userId ? this.accounts.find((a) => a.user_id === userId) : undefined;
    return account ? toSession(account) : null;
  }

  async signIn(input: SignInInput): Promise<Session> {
    const account = this.accounts.find((a) => a.profile_id === input.profileId);
    if (!account) throw new ValidationFailure({ profileId: [PROFILE_UNKNOWN] });
    if (account.email.toLowerCase() !== input.email.trim().toLowerCase()) throw new ValidationFailure({ email: [EMAIL_MISMATCH] });
    this.store.write(account.user_id);
    return toSession(account);
  }

  async signOut(): Promise<void> {
    this.store.clear();
  }

  async listProfiles(): Promise<ProfileOption[]> {
    return this.accounts.map((a) => {
      const s = toSession(a);
      return { profileId: s.profileId, name: s.name, email: s.email, role: s.role };
    });
  }
}
