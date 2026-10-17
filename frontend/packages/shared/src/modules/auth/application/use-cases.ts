import { err, ok } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import { attemptAuth } from "../domain/errors";
import type { Session } from "../domain/role";
import { signInSchema } from "../schemas/sign-in";
import type { AuthRepository, ProfileOption } from "./auth-repository";

export interface AuthDeps {
  auth: AuthRepository;
}

export const getSession = (deps: AuthDeps) => attemptAuth<Session | null>(async () => ok(await deps.auth.getSession()));

export const listProfiles = (deps: AuthDeps) => attemptAuth<ProfileOption[]>(async () => ok(await deps.auth.listProfiles()));

export const signIn = (deps: AuthDeps, raw: unknown) =>
  attemptAuth<Session>(async () => {
    const parsed = signInSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.auth.signIn(parsed.data));
  });

export const signOut = (deps: AuthDeps) =>
  attemptAuth<void>(async () => {
    await deps.auth.signOut();
    return ok(undefined);
  });
