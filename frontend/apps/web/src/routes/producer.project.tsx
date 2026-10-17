import { ArrowLeft, ArrowRight, FileSearch, FileSignature, FileText, Handshake, Landmark, ListChecks, Wheat } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { PendingRetry } from "@agro/shared/modules/payment-lines/domain/line";
import { Button } from "@agro/shared/ui/button";
import { formatDay } from "~/components/presale/format";
import { ProjectGrantsList } from "~/components/grant/project-grants-list";
import { AgreementBanner } from "~/components/negotiation/agreement-banner";
import { AuthorizationList } from "~/components/payment-authorization/authorization-list";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { MilestoneListItem } from "~/components/producer/milestone-list-item";
import { ProducerWalletCard } from "~/components/producer/producer-wallet-card";
import { RequestInboxItem } from "~/components/producer/presale/request-inbox-item";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { milestonePayments } from "~/payment-lines/module";
import { producerPresales } from "~/producer/presales";
import type { Route } from "./+types/producer.project";

const HARVEST_STATUSES: string[] = ["IN_EXECUTION", "FUNDED_IN_CUSTODY", "HARVEST_DECLARED", "LISTED_IN_MARKET", "SETTLED_AND_CLOSED"];
const SETTLEMENT_STATUSES: string[] = ["SETTLEMENT_PROCESSING", "SETTLED_AND_CLOSED"];

export const meta = () => [{ title: "Proyecto · Surco" }];

// One use case returns the whole page: project, milestones, negotiations, agreement and payment authorizations.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [result, lines] = await Promise.all([producerPresales.getProjectView(params.projectId), milestonePayments.getProjectPendingRetry(params.projectId)]);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  // Queued or failed payments per milestone: they keep the milestone open and must be visible here (PRD).
  const pendingByMilestone: Record<string, PendingRetry> = lines.ok ? lines.value : {};
  return { ...result.value, pendingByMilestone };
}

export default function ProducerProject({ loaderData }: Route.ComponentProps) {
  const { pendingByMilestone, project, milestones, negotiations, agreement, authorizations, grants, agreedMilestones } = loaderData;
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
            <Link to={`/producer/projects/${project.id}/lines`}>
              <ListChecks aria-hidden="true" />
              Líneas de pago
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to={`/producer/projects/${project.id}/audit`}>
              <FileSearch aria-hidden="true" />
              Auditoría del proyecto
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to="/producer/proposals">
              <FileSignature aria-hidden="true" />
              Propuestas y contrato de inversión
            </Link>
          </Button>
          {HARVEST_STATUSES.includes(project.currentStatus) && (
            <Button asChild variant="outline" size="compact">
              <Link to={`/producer/projects/${project.id}/harvest`}>
                <Wheat aria-hidden="true" />
                Declarar cosecha
              </Link>
            </Button>
          )}
          {SETTLEMENT_STATUSES.includes(project.currentStatus) && (
            <Button asChild variant="outline" size="compact">
              <Link to={`/producer/projects/${project.id}/settlement`}>
                <Landmark aria-hidden="true" />
                Liquidación
              </Link>
            </Button>
          )}
          {SETTLEMENT_STATUSES.includes(project.currentStatus) && (
            <Button asChild variant="outline" size="compact">
              <Link to={`/producer/projects/${project.id}/statement`}>
                <FileText aria-hidden="true" />
                Estado de cuenta
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <ProducerWalletCard project={project} />
          {agreement && (
            <AgreementBanner authorization={agreement.authorization} to={`/producer/negotiations/${agreement.id}`} />
          )}
          <AuthorizationList authorizations={authorizations} title="Autorizaciones de pago del comprador" emptyText="El comprador aún no autorizó pagos en este proyecto." />
          <ProjectGrantsList
            grants={grants}
            milestoneLabel={(id) => {
              const m = milestones.find((x) => x.id === id);
              return m ? `Hito ${m.sequenceOrder} · ${m.title}` : "Hito";
            }}
          />
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
                  <MilestoneListItem key={m.id} milestone={m} pending={pendingByMilestone[m.id]} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="agreed-milestones-heading" className="flex flex-col gap-4">
            <h2 id="agreed-milestones-heading" className="text-lg text-primary">
              Hitos acordados
            </h2>
            {agreedMilestones.length === 0 ? (
              <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no hay precios acordados por hito.</p>
            ) : (
              <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
                {agreedMilestones.map((a) => (
                  <li key={a.negotiationId} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4">
                    <p className="text-sm text-muted-foreground">Hito {a.sequenceOrder}</p>
                    <h3 className="min-w-0 break-words text-base text-primary">{a.title}</h3>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Precio acordado</dt>
                      <dd className="text-right font-semibold tabular-nums">{formatMoney(a.price, project.currency)}</dd>
                      <dt className="text-muted-foreground">Entrega acordada</dt>
                      <dd className="text-right">{formatDay(a.deliveryDate)}</dd>
                      <dt className="text-muted-foreground">Comprador</dt>
                      <dd className="min-w-0 break-words text-right">{a.buyerName || "Sin nombre"}</dd>
                    </dl>
                    <Link to={`/producer/negotiations/${a.negotiationId}`} className="self-start text-sm font-bold text-primary underline underline-offset-4">
                      Ver negociación
                    </Link>
                  </li>
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
