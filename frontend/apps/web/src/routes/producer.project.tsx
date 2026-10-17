import { ArrowLeft, ArrowRight, Calculator, FileSearch, FileSignature, FileText, Handshake, ListChecks } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import type { PendingRetry } from "@agro/shared/modules/payment-lines/domain/line";
import { Button } from "@agro/shared/ui/button";
import { LedgerList } from "~/components/escrow/ledger-list";
import { CustodyCard } from "~/components/harvest/custody-card";
import { HarvestCard, HarvestStepForm } from "~/components/harvest/harvest-card";
import { AgreementBanner } from "~/components/negotiation/agreement-banner";
import { presaleErrorMessage } from "~/components/presale/error-copy";
import { AdmissionCard } from "~/components/producer/admission-card";
import { AdmissionSection } from "~/components/producer/admission-form";
import { MilestoneListItem } from "~/components/producer/milestone-list-item";
import { ProducerWalletCard } from "~/components/producer/producer-wallet-card";
import { RequestInboxItem } from "~/components/producer/presale/request-inbox-item";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { escrow } from "~/escrow/module";
import { harvest, harvestAction } from "~/harvest/module";
import { ADMISSION_INTENT, admissionAction, loadAdmission } from "~/producer/admission";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import { producerPresales } from "~/producer/presales";
import { milestonePayments } from "~/payment-lines/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/producer.project";

export const meta = () => [{ title: "Proyecto · Surco" }];

// The page composes five reads: the project with its milestones, the negotiations on it, its escrow ledger, its harvest (RF-24)
// and what is still in custody (RF-21). The last two are optional: the page still renders without them.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [project, negotiations, ledger, harvestRead, custody, admission, lines] = await Promise.all([
    producer.getProjectWithMilestones(params.projectId),
    producerPresales.listProducerRequests(params.projectId),
    escrow.getProjectLedger(params.projectId),
    harvest.get(params.projectId),
    harvest.custody(params.projectId),
    loadAdmission(params.projectId),
    milestonePayments.getProjectPendingRetry(params.projectId),
  ]);
  if (!project.ok) {
    if (project.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(errorMessage(project.error), { status: 502 });
  }
  if (!negotiations.ok) throw new Response(presaleErrorMessage(negotiations.error), { status: 502 });
  return {
    ...project.value,
    negotiations: negotiations.value,
    ledger: ledger.ok ? ledger.value : null,
    harvest: harvestRead.ok ? harvestRead.value.harvest : null,
    custody: custody.ok ? custody.value : null,
    admission,
    // Queued or failed payment lines per milestone (payment-lines module; empty when the server has none).
    pendingByMilestone: (lines.ok ? lines.value : {}) as Record<string, PendingRetry>,
  };
}

// RF-02/RF-03 admission and the RF-24 harvest steps post to this route; the form's intent picks the action.
export async function clientAction({ request, params }: Route.ClientActionArgs) {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  if (form.get("intent") === ADMISSION_INTENT) return admissionAction(params.projectId, form);
  return harvestAction(form);
}

// RF-24: the producer declares the harvest once custody is funded and the milestones are running.
const DECLARABLE = ["FUNDED_IN_CUSTODY", "IN_EXECUTION"];
const SETTLEMENT_STATUSES: string[] = ["SETTLEMENT_PROCESSING", "SETTLED_AND_CLOSED"];

export default function ProducerProject({ loaderData }: Route.ComponentProps) {
  const { project, milestones, negotiations, ledger, harvest: projectHarvest, custody, admission, pendingByMilestone } = loaderData;
  const canDeclare = !projectHarvest && DECLARABLE.includes(project.currentStatus);
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
          <Button asChild variant="outline" size="compact">
            <Link to={`/producer/projects/${project.id}/contracts`}>
              <FileSignature aria-hidden="true" />
              Contratos y seguro
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
              Propuestas de inversión
            </Link>
          </Button>
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
            <AgreementBanner authorization={agreement.request.authorization} to={`/producer/negotiations/${agreement.request.id}`} />
          )}
          {custody && <CustodyCard custody={custody} />}
          <AdmissionCard admission={admission} />
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
                  <MilestoneListItem key={m.id} milestone={m} pending={pendingByMilestone[m.id]} />
                ))}
              </ul>
            )}
          </section>

          {/* RF-02/RF-03: admission is evaluated while the project is a DRAFT; afterwards the aside's AdmissionCard is read-only. */}
          {project.currentStatus === "DRAFT" && <AdmissionSection projectId={project.id} admission={admission} />}

          {(projectHarvest || canDeclare) && (
            <HarvestCard harvest={projectHarvest}>
              {canDeclare && (
                <HarvestStepForm
                  projectId={project.id}
                  intent="declare-harvest"
                  label="Declarar cosecha"
                  fields={[
                    { name: "quantityKg", errorKey: "quantity_kg", label: "Cantidad cosechada (kg)", numeric: true },
                    { name: "qualityGrade", errorKey: "quality_grade", label: "Calidad", hint: "Por ejemplo: Excelso, Supremo, Pasilla." },
                    { name: "evidence", errorKey: "evidence", label: "Evidencia", hint: "Describe las fotos o el soporte de la cosecha en bodega.", multiline: true },
                  ]}
                />
              )}
              {projectHarvest?.status === "DECLARED" && <p className="text-sm text-muted-foreground">El verificador revisará la cantidad y la calidad.</p>}
            </HarvestCard>
          )}

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
