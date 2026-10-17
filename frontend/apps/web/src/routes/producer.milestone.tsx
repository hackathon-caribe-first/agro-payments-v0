import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { canRecordEvidence, canSubmitFromStatus, currentFieldData, missingRequirements, requirementChecklist } from "@agro/shared/modules/milestones/domain/milestone-rules";
import { Separator } from "@agro/shared/ui/separator";
import { CustodyCard } from "~/components/harvest/custody-card";
import { BudgetSummary } from "~/components/producer/budget-summary";
import { EvidenceForm } from "~/components/producer/evidence-form";
import { RequirementsChecklist } from "~/components/producer/requirements-checklist";
import { ReviewsHistory } from "~/components/producer/reviews-history";
import { MilestoneStatusBadge } from "~/components/producer/status-label";
import { SubmitReviewForm } from "~/components/producer/submit-review-form";
import { errorMessage, toActionResult, type ProducerActionResult } from "~/producer/error-copy";
import { harvest } from "~/harvest/module";
import { PHOTO_OPTIONS, milestones } from "~/producer/module";
import type { Route } from "./+types/producer.milestone";

export const meta = () => [{ title: "Detalle del hito · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await milestones.getMilestoneDetail(params.milestoneId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(errorMessage(result.error), { status: 502 });
  }
  // RF-21: with an observed milestone nothing more is paid; show what is still in custody. Optional: the page renders without it.
  const custody = result.value.status === OBSERVED ? await harvest.custody(result.value.projectId) : null;
  return { ...result.value, custody: custody?.ok ? custody.value : null };
}

const OBSERVED = "CHANGES_REQUESTED";

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<ProducerActionResult> {
  const form = await request.formData();

  if (form.get("intent") === "submit") {
    const result = await milestones.submitForReview(params.milestoneId);
    return result.ok ? { ok: true } : toActionResult(result.error);
  }

  if (form.get("intent") === "evidence") {
    const result = await milestones.recordEvidenceFromForm(params.milestoneId, form);
    return result.ok ? { ok: true } : toActionResult(result.error);
  }

  return { ok: false, message: "Acción desconocida." };
}

export default function ProducerMilestone({ loaderData: m }: Route.ComponentProps) {
  const fieldData = currentFieldData(m.logs);
  const checklist = requirementChecklist(m.requirements, fieldData);
  const missing = missingRequirements(m.requirements, fieldData);
  const canSubmit = canSubmitFromStatus(m.status) && missing.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/producer/projects/${m.projectId}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />Volver al proyecto
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Hito {m.sequenceOrder}</p>
        <h1 className="break-words text-3xl text-primary">{m.title}</h1>
        <p className="text-pretty text-muted-foreground">{m.description}</p>
        <div className="mt-1">
          <MilestoneStatusBadge status={m.status} />
        </div>
      </header>

      {/* Summary column first in the DOM so it reads before the forms when stacked; it moves to the right on wide screens. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-1">
          {m.custody && (
            <CustodyCard custody={m.custody} note="Hito observado: no se pagan jornales ni se abre el hito siguiente hasta que corrijas. Este dinero sigue en custodia." />
          )}
          <BudgetSummary milestone={m} />
          <Separator />
          <RequirementsChecklist items={checklist} />
        </aside>
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <ReviewsHistory reviews={m.reviews} status={m.status} />

          {canRecordEvidence(m.status) && (
            <>
              <Separator />
              <section aria-labelledby="evidence-heading" className="flex flex-col gap-4">
                <h2 id="evidence-heading" className="text-lg text-primary">
                  Registrar evidencia
                </h2>
                <EvidenceForm requirements={m.requirements} currentData={fieldData} photoOptions={PHOTO_OPTIONS} />
              </section>
            </>
          )}

          {canSubmitFromStatus(m.status) && (
            <>
              <Separator />
              <section aria-labelledby="submit-heading" className="flex flex-col gap-3">
                <h2 id="submit-heading" className="text-lg text-primary">
                  Enviar a revisión
                </h2>
                <SubmitReviewForm canSubmit={canSubmit} missing={missing} requirements={m.requirements} />
              </section>
            </>
          )}
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
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este hito" : "No pudimos cargar el hito"}</h1>
      <p className="mt-2 text-muted-foreground">
        {notFound ? "Puede que el enlace sea incorrecto o que el hito ya no exista." : "Intenta de nuevo en unos minutos."}
      </p>
      <Link to="/producer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis proyectos
      </Link>
    </>
  );
}
