import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { GetCurrentUserUseCase } from "../application/get-current-user.use-case";
import type { AuthenticatedUser } from "../ports/session-resolver";

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

// Rejects requests without a valid session cookie and exposes the user via @CurrentUser().
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly getCurrentUser: GetCurrentUserUseCase) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.getCurrentUser.execute(request.headers);
    return true;
  }
}
