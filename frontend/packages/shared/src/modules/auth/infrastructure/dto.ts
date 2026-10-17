import { z } from "zod";

// Transport shape (snake_case) of GET /users/me. The role arrives as a plain string and the mapper falls back for unknown values.
// Sessions never carry secrets: no password, no token.
export const sessionDtoSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  profile_id: z.string(),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;
