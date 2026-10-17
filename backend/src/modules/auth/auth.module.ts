import { Logger, Module } from "@nestjs/common";
import { loadEnv } from "../../shared/config/env";
import { AssignRoleUseCase } from "./application/assign-role.use-case";
import { GetCurrentUserUseCase } from "./application/get-current-user.use-case";
import { DEMO_IDENTITY, DEMO_PRODUCER_EMAIL, ResolveApiUserUseCase } from "./application/resolve-api-user.use-case";
import { ApiAuthGuard } from "./controllers/api-auth.guard";
import { AuthController } from "./controllers/auth.controller";
import { AuthGuard } from "./controllers/auth.guard";
import { CurrentUserController } from "./controllers/current-user.controller";
import { RolesGuard } from "./controllers/roles.guard";
import { UserRolesController } from "./controllers/user-roles.controller";
import { BetterAuthRequestAdapter } from "./infrastructure/adapters/better-auth-request.adapter";
import { BetterAuthSessionAdapter } from "./infrastructure/adapters/better-auth-session.adapter";
import { BetterAuthUserDirectoryAdapter } from "./infrastructure/adapters/better-auth-user-directory.adapter";
import { BetterAuthUserRoleAdapter } from "./infrastructure/adapters/better-auth-user-role.adapter";
import { betterAuthProvider } from "./infrastructure/better-auth.provider";
import { AuthRequestHandler } from "./ports/auth-request-handler";
import { SessionResolver } from "./ports/session-resolver";
import { UserDirectory } from "./ports/user-directory";
import { UserRoleWriter } from "./ports/user-role-writer";

@Module({
  controllers: [AuthController, CurrentUserController, UserRolesController],
  providers: [
    GetCurrentUserUseCase,
    AssignRoleUseCase,
    ResolveApiUserUseCase,
    AuthGuard,
    ApiAuthGuard,
    RolesGuard,
    betterAuthProvider,
    {
      provide: DEMO_IDENTITY,
      useFactory: () => {
        const on = loadEnv().demoIdentity;
        if (on) new Logger("DemoIdentity").warn(`DEMO_IDENTITY is on: /api requests without a session act as ${DEMO_PRODUCER_EMAIL}. Demo only, never in production.`);
        return on;
      },
    },
    { provide: UserDirectory, useClass: BetterAuthUserDirectoryAdapter },
    { provide: SessionResolver, useClass: BetterAuthSessionAdapter },
    { provide: AuthRequestHandler, useClass: BetterAuthRequestAdapter },
    { provide: UserRoleWriter, useClass: BetterAuthUserRoleAdapter },
  ],
  exports: [AuthGuard, ApiAuthGuard, RolesGuard, GetCurrentUserUseCase, ResolveApiUserUseCase],
})
export class AuthModule {}
