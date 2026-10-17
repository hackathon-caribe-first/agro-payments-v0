import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { MilestoneLinesRow } from "~/components/split/milestone-lines-row";
import { splitErrorMessage } from "~/components/split/copy";
import { producerLines } from "~/payment-lines/module";
import type { Route } from "./+types/split.project-lines";

export const meta = () => [{ title: "Líneas de pago del proyecto · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producerLines.getProjectLines(params.projectId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(splitErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export default function ProjectLines({ loaderData }: Route.ComponentProps) {
  const { project, rows } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to={`/producer/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al proyecto
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{project.projectCode}</p>
        <h1 className="break-words text-3xl text-primary">Líneas de pago · {project.title}</h1>
        <p className="text-pretty text-muted-foreground">El reparto previsto de cada hito, con su tope y lo que quedaría sin ejecutar.</p>
        <Link to="/producer/lines/example" className="w-fit text-sm font-bold text-primary underline underline-offset-4">
          Ver un ejemplo de reparto con las reglas de cálculo
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Este proyecto aún no tiene hitos.</p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {rows.map((row) => (
            <MilestoneLinesRow key={row.milestone.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar las líneas del proyecto"}</h1>
      <Link to="/producer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis proyectos
      </Link>
    </>
  );
}
