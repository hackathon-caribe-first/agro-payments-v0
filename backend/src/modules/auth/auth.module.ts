import { Module } from "@nestjs/common";
import { AssignRoleUseCase } from "./application/assign-role.use-case";
import { GetCurrentUserUseCase } from "./application/get-current-user.use-case";
import { AuthController } from "./controllers/auth.controller";
import { AuthGuard } from "./controllers/auth.guard";
import { CurrentUserController } from "./controllers/current-user.controller";
import { RolesGuard } from "./controllers/roles.guard";
import { UserRolesController } from "./controllers/user-roles.controller";
import { BetterAuthRequestAdapter } from "./infrastructure/adapters/better-auth-request.adapter";
import { BetterAuthSessionAdapter } from "./infrastructure/adapters/better-auth-session.adapter";
import { BetterAuthUserRoleAdapter } from "./infrastructure/adapters/better-auth-user-role.adapter";
import { betterAuthProvider } from "./infrastructure/better-auth.provider";
import { AuthRequestHandler } from "./ports/auth-request-handler";
import { SessionResolver } from "./ports/session-resolver";
import { UserRoleWriter } from "./ports/user-role-writer";

@Module({
  controllers: [AuthController, CurrentUserController, UserRolesController],
  providers: [
    GetCurrentUserUseCase,
    AssignRoleUseCase,
    AuthGuard,
    RolesGuard,
    betterAuthProvider,
    { provide: SessionResolver, useClass: BetterAuthSessionAdapter },
    { provide: AuthRequestHandler, useClass: BetterAuthRequestAdapter },
    { provide: UserRoleWriter, useClass: BetterAuthUserRoleAdapter },
  ],
  exports: [AuthGuard, RolesGuard, GetCurrentUserUseCase],
})
export class AuthModule {}
