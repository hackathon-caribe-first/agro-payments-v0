import type { MilestoneStatus, Review, ReviewVerdict } from "@agro/shared/modules/milestones/domain/milestone";
import { Alert, AlertDescription, AlertTitle } from "@agro/shared/ui/alert";

const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  SUBMITTED: "Enviado a revisión",
  CHANGES_REQUESTED: "Correcciones solicitadas",
  APPROVED_FAVORABLE: "Aprobado técnicamente",
  PAYOUT_EXECUTED: "Pago ejecutado",
};

const dateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

// `reviews` arrive newest first. While changes are requested, the latest verifier comment is highlighted.
export function ReviewsHistory({ reviews, status }: { reviews: Review[]; status: MilestoneStatus }) {
  const feedback = status === "CHANGES_REQUESTED" ? reviews.find((r) => r.verdict === "CHANGES_REQUESTED" && r.comment) : undefined;
  return (
    <section aria-labelledby="reviews-heading" className="flex flex-col gap-3">
      <h2 id="reviews-heading" className="text-lg text-primary">
        Historial de revisiones
      </h2>
      {feedback && (
        <Alert variant="destructive">
          <AlertTitle>Comentario del verificador</AlertTitle>
          <AlertDescription>{feedback.comment}</AlertDescription>
        </Alert>
      )}
      {reviews.length === 0 ? (
        <p className="text-muted-foreground">Aún no hay revisiones para este hito.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-md border bg-card p-3">
              <p className="font-semibold">{VERDICT_LABELS[r.verdict]}</p>
              <p className="text-sm text-muted-foreground">{dateFormat.format(new Date(r.createdAt))}</p>
              {r.comment && <p className="mt-1">{r.comment}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
