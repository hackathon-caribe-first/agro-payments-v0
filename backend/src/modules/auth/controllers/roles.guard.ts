import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GetCurrentUserUseCase } from "../application/get-current-user.use-case";
import type { Role } from "../ports/role";
import type { AuthenticatedRequest } from "./auth.guard";
import { ROLES_KEY } from "./roles.decorator";

// 401 without a session, 403 when the user's role is not listed in @Roles(...).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly getCurrentUser: GetCurrentUserUseCase,
  ) {}

  async canActivate(context: ExecutionContext) {
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user ??= await this.getCurrentUser.execute(request.headers);
    if (allowed && allowed.length > 0 && !allowed.includes(request.user.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
