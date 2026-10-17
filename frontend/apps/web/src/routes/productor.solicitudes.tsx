import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { RequestInboxItem } from "~/components/producer/presale/request-inbox-item";
import { producerPresales } from "~/producer/presales";
import type { Route } from "./+types/productor.solicitudes";

export const meta = () => [{ title: "Solicitudes de cotización · Surco" }];

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const projectId = new URL(request.url).searchParams.get("proyecto") ?? undefined;
  const result = await producerPresales.listProducerRequests(projectId);
  if (!result.ok) throw new Response(presaleErrorMessage(result.error), { status: 502 });
  return { entries: result.value, projectId };
}

export default function ProductorSolicitudes({ loaderData }: Route.ComponentProps) {
  const { entries, projectId } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link
        to={projectId ? `/productor/proyectos/${projectId}/preventa` : "/productor"}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {projectId ? "Volver a la preventa" : "Volver a mis proyectos"}
      </Link>
      <header>
        <h1 className="text-3xl text-primary">Solicitudes de cotización</h1>
        <p className="mt-2 text-muted-foreground">Responde a los compradores interesados en tu producción.</p>
      </header>
      {entries.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no tienes solicitudes de cotización.</p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {entries.map((entry) => (
            <RequestInboxItem key={entry.request.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
