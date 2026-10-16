import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "../../ports/role";
import { UserRoleWriter } from "../../ports/user-role-writer";
import type { BetterAuthInstance } from "../better-auth.factory";
import { BETTER_AUTH } from "../better-auth.provider";

@Injectable()
export class BetterAuthUserRoleAdapter extends UserRoleWriter {
  constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuthInstance) {
    super();
  }

  async assign(userId: string, role: Role): Promise<boolean> {
    // The raw adapter skips databaseHooks, which otherwise reject any role change coming from public endpoints.
    const { adapter } = await this.auth.$context;
    const updated = await adapter.update({ model: "user", where: [{ field: "id", value: userId }], update: { role } });
    return updated !== null;
  }
}
