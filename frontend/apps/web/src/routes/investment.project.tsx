import { ArrowLeft, FileSearch, HandCoins, KeyRound } from "lucide-react";
import { Link, data, isRouteErrorResponse, redirect, useRouteError } from "react-router";
import { formatYield } from "@agro/shared/modules/investment-proposals/domain/proposal-rules";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formFields } from "~/components/investment/actions";
import { investmentErrorMessage, proposeBlockText, toActionData, type InvestmentActionData } from "~/components/investment/error-copy";
import { ProjectMilestones } from "~/components/investment/project-milestones";
import { ProposalForm } from "~/components/investment/proposal-form";
import { formatDay } from "~/components/presale/format";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { investor } from "~/investment-proposals/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/investment.project";

export const meta = () => [{ title: "Proyecto · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await investor.getProjectDetail(params.projectId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(investmentErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

// The investor's opening proposal: one use case, then straight to its detail.
export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<InvestmentActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const result = await investor.createProposal(params.projectId, formFields(form));
  return result.ok ? redirect(`/investor/proposals/${result.value.id}`) : toActionData(result.error);
}

export default function InvestmentProject({ loaderData, actionData }: Route.ComponentProps) {
  const { catalog, block, myLiveProposalId } = loaderData;
  const { project } = catalog;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/investor/catalog" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Volver a los proyectos
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="compact">
            <Link to={`/investor/projects/${project.id}/grants`}>
              <KeyRound aria-hidden="true" />
              Mis grants del proyecto
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to={`/investor/projects/${project.id}/audit`}>
              <FileSearch aria-hidden="true" />
              Auditoría del proyecto
            </Link>
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to="/investor/proposals">
              <HandCoins aria-hidden="true" />
              Mis propuestas
            </Link>
          </Button>
        </div>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {productionTypeLabel(project.productionType)} · {catalog.producerName}
          </p>
          <h1 className="break-words text-3xl text-primary">{project.title}</h1>
          <p className="mt-2 text-pretty text-muted-foreground">{project.description}</p>
        </div>
        <ProjectStatusBadge status={project.currentStatus} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <p className="text-sm text-muted-foreground">{project.projectCode}</p>
              <CardTitle className="break-words text-base text-primary">{project.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-4">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Total de la cotización del proyecto:{" "}
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(catalog.quotationTotal, project.currency)}</span>
              </p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Inicio</dt>
                  <dd className="font-semibold">{formatDay(project.startDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fin estimado</dt>
                  <dd className="font-semibold">{formatDay(project.estimatedEndDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Productor</dt>
                  <dd className="font-semibold">{catalog.producerName}</dd>
                </div>
                {project.investorRoiPct > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Rendimiento de referencia</dt>
                    <dd className="font-semibold tabular-nums">{formatYield(Math.round(project.investorRoiPct * 100))}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">Enviar propuesta</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {block === null ? (
                <>
                  <p className="text-pretty text-sm text-muted-foreground">
                    Propón el monto y el rendimiento. El productor la acepta, la rechaza o te envía una contraoferta; al acordar, se genera el contrato para que ambos lo firmen.
                  </p>
                  <ProposalForm intent="propose" maxAmount={catalog.quotationTotal} currency={project.currency} submitLabel="Enviar propuesta" actionData={actionData} />
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <p role="status" className="text-muted-foreground">
                    {proposeBlockText(block)}
                  </p>
                  {block === "duplicate" && myLiveProposalId && (
                    <Button asChild variant="outline" size="compact" className="self-start">
                      <Link to={`/investor/proposals/${myLiveProposalId}`}>Ver mi propuesta</Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <section aria-labelledby="investment-milestones-heading" className="flex flex-col gap-3">
            <h2 id="investment-milestones-heading" className="text-lg text-primary">
              Hitos y topes
            </h2>
            <ProjectMilestones milestones={catalog.milestones} currency={project.currency} />
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
        {notFound ? "Puede que el enlace sea incorrecto o que el proyecto ya no esté abierto a inversión." : "Intenta de nuevo en unos minutos."}
      </p>
      <Link to="/investor/catalog" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a los proyectos
      </Link>
    </>
  );
}
