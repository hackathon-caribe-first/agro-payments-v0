import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { ResolveApiUserUseCase } from "../application/resolve-api-user.use-case";
import type { AuthenticatedRequest } from "./auth.guard";

// AuthGuard for the /api controllers only: same session check, plus the DEMO_IDENTITY fallback. Legacy routes keep AuthGuard.
// Pair with RolesGuard, which reuses the user set here.
@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(private readonly resolveUser: ResolveApiUserUseCase) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.resolveUser.execute(request.headers);
    return true;
  }
}
