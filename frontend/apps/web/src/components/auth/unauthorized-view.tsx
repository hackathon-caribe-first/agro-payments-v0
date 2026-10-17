import { Home, LogOut } from "lucide-react";
import { Form, Link } from "react-router";
import { homePathFor } from "@agro/shared/modules/auth/domain/access";
import type { Session } from "@agro/shared/modules/auth/domain/role";
import { Button } from "@agro/shared/ui/button";

// 403: the session exists but its role cannot open this section.
export function UnauthorizedView({ session }: { session: Session | null }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl text-primary">No tienes acceso a esta sección</h1>
      <p className="max-w-prose text-pretty text-muted-foreground">
        Tu perfil no incluye esta página. Vuelve a tu inicio o entra con otro perfil.
      </p>
      <div className="flex flex-wrap gap-2">
        {session ? (
          <Button asChild size="compact">
            <Link to={homePathFor(session.role)}>
              <Home aria-hidden="true" />
              Ir a mi inicio
            </Link>
          </Button>
        ) : null}
        <Form method="post" action="/logout">
          <Button type="submit" size="compact" variant="outline">
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </Button>
        </Form>
      </div>
    </div>
  );
}
