import { currentSession } from "~/auth/guard";
import { AuthPage } from "~/components/auth/auth-page";
import { UnauthorizedView } from "~/components/auth/unauthorized-view";
import type { Route } from "./+types/unauthorized";

export const meta = () => [{ title: "Sin acceso · Surco" }];

export async function clientLoader() {
  return { session: await currentSession() };
}

export default function Unauthorized({ loaderData }: Route.ComponentProps) {
  return (
    <AuthPage>
      <UnauthorizedView session={loaderData.session} />
    </AuthPage>
  );
}
