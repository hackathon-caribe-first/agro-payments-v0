import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { type AuthenticatedUser, type RequestHeaders, SessionResolver } from "../ports/session-resolver";
import { UserDirectory } from "../ports/user-directory";
import { DEMO_IDENTITY, DEMO_PARTIES, PARTY_SIDE, type PartySide } from "./demo-parties";

export { DEMO_IDENTITY };
/** The producer seeded in the dev database; the demo acts as this user when nobody is signed in. */
export const DEMO_PRODUCER_EMAIL = DEMO_PARTIES.producer.email;

// Who is calling an /api route: the Better Auth session, or — only with DEMO_IDENTITY=true — the seeded demo user of the route's
// side (producer by default; buyer routes ask for "buyer"). The web app has no login yet, so without this every /api call is a 401.
// Identity never comes from the request: the session cookie or the fixed demo email, nothing else.
// ponytail: demo only, never in production; remove when the web app signs in (RF-01).
@Injectable()
export class ResolveApiUserUseCase {
  constructor(
    private readonly sessions: SessionResolver,
    private readonly directory: UserDirectory,
    @Inject(DEMO_IDENTITY) private readonly demoIdentity: boolean,
  ) {}

  async execute(headers: RequestHeaders, side: PartySide = PARTY_SIDE.PRODUCER): Promise<AuthenticatedUser> {
    const user = await this.sessions.resolve(headers);
    if (user) return user;
    if (!this.demoIdentity) throw new UnauthorizedException("Authentication required");
    return this.demoUser(side);
  }

  /** For reads either party may make: the session user, or (demo) both demo parties that exist. */
  async candidates(headers: RequestHeaders): Promise<AuthenticatedUser[]> {
    const user = await this.sessions.resolve(headers);
    if (user) return [user];
    if (!this.demoIdentity) throw new UnauthorizedException("Authentication required");
    const found = await Promise.all([PARTY_SIDE.BUYER, PARTY_SIDE.PRODUCER].map((side) => this.demoUser(side).catch(() => null)));
    const users = found.filter((u): u is AuthenticatedUser => u !== null);
    if (users.length === 0) throw new UnauthorizedException("DEMO_IDENTITY is on but no demo user exists; sign up the demo users first");
    return users;
  }

  private async demoUser(side: PartySide): Promise<AuthenticatedUser> {
    const { email, role } = DEMO_PARTIES[side];
    const demo = await this.directory.findByEmail(email);
    if (!demo || demo.role !== role) {
      throw new UnauthorizedException(`DEMO_IDENTITY is on but the demo ${side} ${email} does not exist as a ${role}; sign up that user first`);
    }
    return demo;
  }
}
