import { ArrowLeft, ArrowRight, Calculator, Handshake } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Button } from "@agro/shared/ui/button";
import { LedgerList } from "~/components/escrow/ledger-list";
import { AgreementBanner } from "~/components/negotiation/agreement-banner";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { MilestoneListItem } from "~/components/producer/milestone-list-item";
import { RequestInboxItem } from "~/components/producer/presale/request-inbox-item";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { escrow } from "~/escrow/module";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import { producerPresales } from "~/producer/presales";
import type { Route } from "./+types/producer.project";

export const meta = () => [{ title: "Proyecto · Surco" }];

// The page composes three reads: the project with its milestones, the negotiations on it, and its escrow ledger.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [project, negotiations, ledger] = await Promise.all([
    producer.getProjectWithMilestones(params.projectId),
    producerPresales.listProducerRequests(params.projectId),
    escrow.getProjectLedger(params.projectId),
  ]);
  if (!project.ok) {
    if (project.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(errorMessage(project.error), { status: 502 });
  }
  if (!negotiations.ok) throw new Response(presaleErrorMessage(negotiations.error), { status: 502 });
  return { ...project.value, negotiations: negotiations.value, ledger: ledger.ok ? ledger.value : null };
}

export default function ProducerProject({ loaderData }: Route.ComponentProps) {
  const { project, milestones, negotiations, ledger } = loaderData;
  const agreement = negotiations.find((e) => e.request.scope === "PROJECT" && e.request.status === "ACCEPTED") ?? null;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/producer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
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
            <Link to={`/producer/negotiations?project=${project.id}`}>
              <Handshake aria-hidden="true" />
              Negociaciones
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to={`/producer/projects/${project.id}/publication`}>
              <Calculator aria-hidden="true" />
              Ficha y publicación
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          {agreement && (
            <AgreementBanner deposit={agreement.request.deposit} to={`/producer/negotiations/${agreement.request.id}`} />
          )}
          {ledger && <LedgerList ledger={ledger} currency={project.currency} />}
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <section aria-labelledby="milestones-heading" className="flex flex-col gap-4">
            <h2 id="milestones-heading" className="text-lg text-primary">
              Hitos
            </h2>
            {milestones.length === 0 ? (
              <p className="rounded-lg border bg-card p-5 text-muted-foreground">Este proyecto aún no tiene hitos.</p>
            ) : (
              <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
                {milestones.map((m) => (
                  <MilestoneListItem key={m.id} milestone={m} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="inbox-heading" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="inbox-heading" className="text-lg text-primary">
                Negociaciones
              </h2>
              <Button asChild variant="outline" size="compact">
                <Link to={`/producer/negotiations?project=${project.id}`}>
                  Ver todas
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            {negotiations.length === 0 ? (
              <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no hay negociaciones para este proyecto.</p>
            ) : (
              <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
                {negotiations.slice(0, 3).map((entry) => (
                  <RequestInboxItem key={entry.request.id} entry={entry} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
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
      <Link to="/producer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis proyectos
      </Link>
    </>
  );
}
