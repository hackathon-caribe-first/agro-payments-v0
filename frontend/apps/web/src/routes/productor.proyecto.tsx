import { ArrowLeft, FileText, Megaphone } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Button } from "@agro/shared/ui/button";
import { MilestoneListItem } from "~/components/producer/milestone-list-item";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import type { Route } from "./+types/productor.proyecto";

export const meta = () => [{ title: "Proyecto · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producer.getProjectWithMilestones(params.projectId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(errorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export default function ProductorProyecto({ loaderData }: Route.ComponentProps) {
  const { project, milestones } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/productor" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />Volver a mis proyectos
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {project.projectCode} · {productionTypeLabel(project.productionType)}
        </p>
        <h1 className="break-words text-3xl text-primary">{project.title}</h1>
        <p className="text-pretty text-muted-foreground">{project.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ProjectStatusBadge status={project.currentStatus} />
          <Button asChild variant="outline" size="compact">
            <Link to={`/productor/proyectos/${project.id}/preventa`}>
              <Megaphone aria-hidden="true" />
              Preventa
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to={`/productor/solicitudes?proyecto=${project.id}`}>
              <FileText aria-hidden="true" />
              Solicitudes
            </Link>
          </Button>
        </div>
      </header>
      <section aria-labelledby="milestones-heading" className="flex flex-col gap-4">
        <h2 id="milestones-heading" className="text-lg text-primary">
          Hitos
        </h2>
        {milestones.length === 0 ? (
          <p className="rounded-lg border bg-card p-5 text-muted-foreground">Este proyecto aún no tiene hitos.</p>
        ) : (
          <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
            {milestones.map((m) => (
              <MilestoneListItem key={m.id} milestone={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar el proyecto"}</h1>
      <p className="mt-2 text-muted-foreground">
        {notFound ? "Puede que el enlace sea incorrecto o que el proyecto ya no exista." : "Intenta de nuevo en unos minutos."}
      </p>
      <Link to="/productor" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis proyectos
      </Link>
    </>
  );
}
