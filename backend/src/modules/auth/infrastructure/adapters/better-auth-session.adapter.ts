import { Inject, Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import { isRole } from "../../ports/role";
import { type AuthenticatedUser, type RequestHeaders, SessionResolver } from "../../ports/session-resolver";
import type { BetterAuthInstance } from "../better-auth.factory";
import { BETTER_AUTH } from "../better-auth.provider";

@Injectable()
export class BetterAuthSessionAdapter extends SessionResolver {
  constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuthInstance) {
    super();
  }

  async resolve(headers: RequestHeaders): Promise<AuthenticatedUser | null> {
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!session) return null;
    const { id, email, name, role } = session.user;
    // A role outside the known set means corrupted data: treat it as no session rather than guess.
    if (!isRole(role)) return null;
    return { id, email, name, role };
  }
}
