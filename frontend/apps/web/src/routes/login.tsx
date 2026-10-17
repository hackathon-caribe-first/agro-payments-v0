import { redirect } from "react-router";
import { safeNextPath } from "@agro/shared/modules/auth/domain/access";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { currentSession } from "~/auth/guard";
import { auth } from "~/auth/module";
import { AuthPage } from "~/components/auth/auth-page";
import { SignInForm, type SignInActionData } from "~/components/auth/sign-in-form";
import type { Route } from "./+types/login";

export const meta = () => [{ title: "Iniciar sesión · Surco" }];

const nextOf = (request: Request) => new URL(request.url).searchParams.get("next");

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const session = await currentSession();
  if (session) throw redirect(safeNextPath(nextOf(request), session.role));
  const profiles = await auth.listProfiles();
  return { profiles: profiles.ok ? profiles.value : [] };
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<SignInActionData | Response> {
  const form = await request.formData();
  const result = await auth.signIn({ email: String(form.get("email") ?? ""), profileId: String(form.get("profileId") ?? "") });
  if (result.ok) return redirect(safeNextPath(nextOf(request), result.value.role));
  const { error } = result;
  if (error.kind === "validation") return { fieldErrors: error.fieldErrors };
  return { fieldErrors: { [FORM_LEVEL_KEY]: ["No pudimos iniciar sesión. Intenta de nuevo en unos minutos."] } };
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <AuthPage>
      <h1 className="text-2xl text-primary">Iniciar sesión</h1>
      <p className="mb-5 mt-1 text-pretty text-muted-foreground">Cada perfil ve solo lo que le corresponde.</p>
      <SignInForm profiles={loaderData.profiles} actionData={actionData} />
    </AuthPage>
  );
}
