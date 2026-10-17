import { BoundaryError } from "../../milestones/domain/errors";
import { toRole, type Session } from "../domain/role";
import { sessionDtoSchema } from "./dto";

export function toSession(data: unknown): Session {
  const result = sessionDtoSchema.safeParse(data);
  if (!result.success) throw new BoundaryError("Unexpected session payload");
  const dto = result.data;
  return { userId: dto.user_id, name: dto.name, email: dto.email, role: toRole(dto.role), profileId: dto.profile_id };
}
