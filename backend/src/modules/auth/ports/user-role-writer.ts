import type { Role } from "./role";

// Persists a user's role. Only the admin use case should reach this; public auth endpoints never can.
export abstract class UserRoleWriter {
  // Resolves false when no user has that id.
  abstract assign(userId: string, role: Role): Promise<boolean>;
}
