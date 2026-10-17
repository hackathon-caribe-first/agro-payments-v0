import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { type AuthenticatedUser, type RequestHeaders, SessionResolver } from "../ports/session-resolver";
import { UserDirectory } from "../ports/user-directory";

/** DI token: the parsed DEMO_IDENTITY flag. */
export const DEMO_IDENTITY = Symbol("DEMO_IDENTITY");
/** The producer seeded in the dev database; the demo acts as this user when nobody is signed in. */
export const DEMO_PRODUCER_EMAIL = "productor@agro.dev";

// Who is calling an /api route: the Better Auth session, or — only with DEMO_IDENTITY=true — the seeded demo producer.
// The web app on feat/producer-milestones has no login yet, so without this every /api call is a 401.
// Identity never comes from the request: the session cookie or the fixed demo email, nothing else.
// ponytail: demo only, never in production; remove when the producer app signs in (RF-01).
@Injectable()
export class ResolveApiUserUseCase {
  constructor(
    private readonly sessions: SessionResolver,
    private readonly directory: UserDirectory,
    @Inject(DEMO_IDENTITY) private readonly demoIdentity: boolean,
  ) {}

  async execute(headers: RequestHeaders): Promise<AuthenticatedUser> {
    const user = await this.sessions.resolve(headers);
    if (user) return user;
    if (!this.demoIdentity) throw new UnauthorizedException("Authentication required");
    const demo = await this.directory.findByEmail(DEMO_PRODUCER_EMAIL);
    if (!demo || demo.role !== "seller") {
      throw new UnauthorizedException(`DEMO_IDENTITY is on but the demo producer ${DEMO_PRODUCER_EMAIL} does not exist as a seller; sign up that user first`);
    }
    return demo;
  }
}
