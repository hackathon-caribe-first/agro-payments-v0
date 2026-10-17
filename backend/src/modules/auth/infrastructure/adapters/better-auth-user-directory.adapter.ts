import { Inject, Injectable } from "@nestjs/common";
import { isRole } from "../../ports/role";
import type { AuthenticatedUser } from "../../ports/session-resolver";
import { UserDirectory } from "../../ports/user-directory";
import type { BetterAuthInstance } from "../better-auth.factory";
import { BETTER_AUTH } from "../better-auth.provider";

@Injectable()
export class BetterAuthUserDirectoryAdapter extends UserDirectory {
  constructor(@Inject(BETTER_AUTH) private readonly auth: BetterAuthInstance) {
    super();
  }

  async findByEmail(email: string): Promise<AuthenticatedUser | null> {
    const { internalAdapter } = await this.auth.$context;
    // Better Auth stores emails lowercased.
    const found = await internalAdapter.findUserByEmail(email.toLowerCase());
    if (!found) return null;
    const { id, name, role } = found.user as { id: string; name: string; role?: unknown };
    return isRole(role) ? { id, email: found.user.email, name, role } : null;
  }
}
