import { AlertTriangle, ListChecks } from "lucide-react";
import { Link } from "react-router";
import { pendingRetryText, type PendingRetry } from "@agro/shared/modules/payment-lines/domain/line";
import { Alert, AlertDescription, AlertTitle } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { CONCEPT_LABELS } from "./copy";

// PRD: the milestone does not close until every one of its lines is in a final state. Shown on the pages where a queued or failed
// payment would otherwise go unnoticed. `linesHref` is only given to the producer, who is the one that can retry ("Ver pagos").
export function PendingRetryBanner({ pending, linesHref }: { pending: PendingRetry; linesHref?: string }) {
  if (pending.count === 0) return null;
  return (
    <Alert role="status">
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>Pagos pendientes de reintento</AlertTitle>
      <AlertDescription>
        <p>{pendingRetryText(pending.count)}</p>
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
          {pending.lines.map((line) => (
            <li key={line.id} title={line.code ?? undefined}>
              <span className="font-semibold">{CONCEPT_LABELS[line.concept]}</span>
              {line.reference ? ` ${line.reference}` : ""}: {line.reason ?? (line.status === "en_cola" ? "En cola para un nuevo intento." : "El pago no se completó.")}
            </li>
          ))}
        </ul>
        {linesHref && (
          <Button asChild variant="outline" size="compact" className="mt-2">
            <Link to={linesHref}>
              <ListChecks aria-hidden="true" />
              Ver pagos
            </Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
