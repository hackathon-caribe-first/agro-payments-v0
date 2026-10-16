import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Role } from "../ports/role";
import { UserRoleWriter } from "../ports/user-role-writer";

@Injectable()
export class AssignRoleUseCase {
  constructor(private readonly roles: UserRoleWriter) {}

  async execute(actorId: string, targetUserId: string, role: Role): Promise<{ id: string; role: Role }> {
    // Stops the last admin from locking everyone out by demoting themselves.
    if (actorId === targetUserId) throw new ForbiddenException("Admins cannot change their own role");
    const updated = await this.roles.assign(targetUserId, role);
    if (!updated) throw new NotFoundException("User not found");
    return { id: targetUserId, role };
  }
}
