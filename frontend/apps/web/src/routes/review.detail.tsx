import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { currentFieldData, requirementChecklist } from "@agro/shared/modules/milestones/domain/milestone-rules";
import { canIssueDictamen } from "@agro/shared/modules/reviews/domain/review-rules";
import type { PendingRetry } from "@agro/shared/modules/payment-lines/domain/line";
import { Alert, AlertDescription, AlertTitle } from "@agro/shared/ui/alert";
import { Separator } from "@agro/shared/ui/separator";
import { BudgetSummary } from "~/components/producer/budget-summary";
import { RequirementsChecklist } from "~/components/producer/requirements-checklist";
import { MilestoneStatusBadge } from "~/components/producer/status-label";
import { DictamenForm } from "~/components/review/dictamen-form";
import { EvidenceTimeline } from "~/components/review/evidence-timeline";
import { formatDate } from "~/components/review/format";
import { PayoutPanel } from "~/components/review/payout-panel";
import { ReviewHistory } from "~/components/review/review-history";
import { reviewErrorMessage, toActionData, type ReviewActionData } from "~/reviews/error-copy";
import { VERIFIER, reviews } from "~/reviews/module";
import { PendingRetryBanner } from "~/components/split/pending-retry-banner";
import { milestonePayments } from "~/payment-lines/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/review.detail";

export const meta = () => [{ title: "Verificación del hito · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [result, payments] = await Promise.all([reviews.getDetail(params.milestoneId), milestonePayments.getPendingRetry(params.milestoneId)]);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(reviewErrorMessage(result.error), { status: 502 });
  }
  const pending: PendingRetry = payments.ok ? payments.value : { count: 0, lines: [] };
  return { detail: result.value, pending };
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<ReviewActionData> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "dictamen") {
    let raw: unknown = null;
    try {
      raw = JSON.parse(String(form.get("payload") ?? "null"));
    } catch {
      raw = null;
    }
    const result = await reviews.issueDictamen(params.milestoneId, raw);
    return result.ok ? { ok: true, message: "Dictamen emitido." } : toActionData(result.error);
  }

  if (intent === "confirm-payout") {
    const result = await reviews.confirmPayout(params.milestoneId);
    return result.ok ? { ok: true, message: "Pago confirmado." } : toActionData(result.error);
  }

  return { ok: false, fieldErrors: { _form: ["Acción desconocida."] } };
}

export default function ReviewDetailPage({ loaderData }: Route.ComponentProps) {
  const { detail, pending } = loaderData;
  const { milestone: m, project, assignment } = detail;
  const checklist = requirementChecklist(m.requirements, currentFieldData(m.logs));
  const reviewable = canIssueDictamen(m.status);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/verifier/reviews" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />Volver a verificaciones
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {project.title} · Hito {m.sequenceOrder}
        </p>
        <h1 className="break-words text-3xl text-primary">{m.title}</h1>
        <p className="text-pretty text-muted-foreground">{m.description}</p>
        <div className="mt-1" aria-live="polite">
          <MilestoneStatusBadge status={m.status} />
        </div>
      </header>

      <PendingRetryBanner pending={pending} />

      {/* Summary column first in the DOM so it reads before the forms when stacked; it moves to the right on wide screens. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-6 lg:col-start-2 lg:row-start-1">
          <BudgetSummary milestone={m} />
          <Separator />
          <RequirementsChecklist items={checklist} />
          <Separator />
          <section aria-labelledby="assignment-heading" className="flex flex-col gap-2">
            <h2 id="assignment-heading" className="text-lg text-primary">
              Verificador asignado
            </h2>
            <p className="font-semibold">{assignment.verifierName}</p>
            <p className="text-sm text-muted-foreground">Asignado el {formatDate(assignment.assignedAt)}</p>
          </section>
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <EvidenceTimeline logs={m.logs} requirements={m.requirements} photoMeta={detail.photoMeta} />
          <Separator />
          <ReviewHistory entries={detail.history} />
          <PayoutPanel detail={detail} />

          {reviewable && (
            <>
              <Separator />
              <section aria-labelledby="dictamen-heading" className="flex flex-col gap-4">
                <h2 id="dictamen-heading" className="text-lg text-primary">
                  Dictamen técnico
                </h2>
                {detail.canReview ? (
                  <DictamenForm detail={detail} verifierId={VERIFIER.id} />
                ) : (
                  <Alert>
                    <AlertTitle>Solo lectura</AlertTitle>
                    <AlertDescription>Solo el verificador asignado al proyecto puede emitir el dictamen de este hito.</AlertDescription>
                  </Alert>
                )}
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
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este hito" : "No pudimos cargar la verificación"}</h1>
      <p className="mt-2 text-muted-foreground">
        {notFound ? "Puede que el enlace sea incorrecto o que el hito ya no exista." : "Intenta de nuevo en unos minutos."}
      </p>
      <Link to="/verifier/reviews" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a verificaciones
      </Link>
    </>
  );
}
