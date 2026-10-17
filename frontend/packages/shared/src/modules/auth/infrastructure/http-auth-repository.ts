import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import type { AuthRepository, ProfileOption } from "../application/auth-repository";
import type { Session } from "../domain/role";
import type { SignInInput } from "../schemas/sign-in";
import { toSession } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

export const BAD_CREDENTIALS = "El correo o la contraseña no son correctos.";
export const PASSWORD_REQUIRED = "Ingresa tu contraseña.";

// The accounts seeded on our backend, one per role (the supplier has no backend account: mock only). profileId is the alias
// GET /api/users/me answers for each of them (backend auth/application/session-profile.ts).
export const HTTP_PROFILES: readonly ProfileOption[] = [
  { profileId: "producer-main", name: "Agrícola La Esperanza S.A.S.", email: "productor@agro.dev", role: "PRODUCER" },
  { profileId: "buyer-andina", name: "Comercializadora Andina S.A.S.", email: "comprador@agro.dev", role: "BUYER" },
  { profileId: "investor-capital-verde", name: "Capital Verde Inversiones S.A.S.", email: "inversionista@agro.dev", role: "INVESTOR" },
  { profileId: "verifier-camila-rojas", name: "Camila Rojas", email: "verificador@agro.dev", role: "VERIFIER" },
  { profileId: "operator-surco", name: "Operación Surco", email: "fiduciaria@agro.dev", role: "OPERATOR" },
];

// Better Auth over the backend: the session is an httpOnly cookie, so every call sends credentials and nothing is stored here.
export class HttpAuthRepository implements AuthRepository {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl, fetchFn }: Options) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, { credentials: "include", ...init });
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
  }

  async getSession(): Promise<Session | null> {
    const response = await this.request("/users/me");
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return toSession(await response.json());
  }

  async signIn(input: SignInInput): Promise<Session> {
    if (!input.password) throw new ValidationFailure({ password: [PASSWORD_REQUIRED] });
    const response = await this.request("/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: input.email.trim(), password: input.password }),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) throw new ValidationFailure({ password: [BAD_CREDENTIALS] });
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    const session = await this.getSession();
    if (!session) throw new NetworkError("Signed in but no session was returned");
    return session;
  }

  async signOut(): Promise<void> {
    await this.request("/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  }

  async listProfiles(): Promise<ProfileOption[]> {
    return [...HTTP_PROFILES];
  }
}
