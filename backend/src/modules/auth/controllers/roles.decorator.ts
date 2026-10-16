import { SetMetadata } from "@nestjs/common";
import type { Role } from "../ports/role";

export const ROLES_KEY = "roles";

// Restricts a route to the given roles. Use together with AuthGuard and RolesGuard.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
