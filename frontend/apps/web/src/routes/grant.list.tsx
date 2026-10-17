import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { GrantCard } from "~/components/grant/grant-card";
import { investor, unwrapGrant } from "~/grants/module";
import type { Route } from "./+types/grant.list";

export const meta = () => [{ title: "Mis grants · Surco" }];

export async function clientLoader() {
  return unwrapGrant(await investor.listGrants());
}

export default function InvestorGrants({ loaderData }: Route.ComponentProps) {
  const { grants, projects } = loaderData;
  const pending = grants.filter((g) => g.grant.status === "PENDING_APPROVAL").length;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Mis grants</h1>
        <p className="mt-2 max-w-prose text-pretty text-muted-foreground">
          Cada hito tiene un solo permiso de pago, con tope igual a su presupuesto. Tu dinero se queda en tu billetera: lo que no se gasta no sale, y el
          permiso se revoca cuando el hito termina.
        </p>
      </header>

      {pending > 0 && (
        <p role="status" className="rounded-md bg-warning px-4 py-3 text-sm font-semibold text-warning-foreground">
          ◷ Tienes {pending === 1 ? "un grant pendiente" : `${pending} grants pendientes`} de aprobación.
        </p>
      )}

      <section aria-labelledby="grants-heading" className="flex flex-col gap-3">
        <h2 id="grants-heading" className="text-xl text-primary">
          Grants por hito
        </h2>
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no has solicitado ningún grant. Elige un proyecto para pedir el del primer hito.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
            {grants.map((view) => (
              <GrantCard key={view.grant.id} view={view} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="projects-heading" className="flex flex-col gap-3">
        <h2 id="projects-heading" className="text-xl text-primary">
          Proyectos
        </h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
          {projects.map((project) => (
            <li key={project.id} className="min-w-0">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="break-words text-base text-primary">{project.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" size="compact">
                    <Link to={`/investor/projects/${project.id}/grants`}>
                      Gestionar grants del proyecto
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <>
      <h1 className="text-2xl text-primary">No pudimos cargar tus grants</h1>
      <p className="mt-2 text-muted-foreground">Revisa tu conexión y vuelve a intentarlo.</p>
      <a href="" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </a>
    </>
  );
}
