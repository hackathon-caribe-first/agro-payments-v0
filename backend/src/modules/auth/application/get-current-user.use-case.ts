import { Injectable, UnauthorizedException } from "@nestjs/common";
import { type AuthenticatedUser, type RequestHeaders, SessionResolver } from "../ports/session-resolver";

@Injectable()
export class GetCurrentUserUseCase {
  constructor(private readonly sessions: SessionResolver) {}

  async execute(headers: RequestHeaders): Promise<AuthenticatedUser> {
    const user = await this.sessions.resolve(headers);
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }
}
