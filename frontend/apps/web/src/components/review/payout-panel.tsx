import { BadgeCheck, Banknote } from "lucide-react";
import { useFetcher } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { ReviewDetail } from "@agro/shared/modules/reviews/domain/review";
import { canConfirmPayout, hasSignedApproval } from "@agro/shared/modules/reviews/domain/review-rules";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@agro/shared/ui/alert-dialog";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import type { ReviewActionData } from "~/reviews/error-copy";
import { formatDateTime } from "./format";

// Payout of the producer line. It only appears once the dictamen is approved, and only works with a signed approval.
export function PayoutPanel({ detail }: { detail: ReviewDetail }) {
  const fetcher = useFetcher<ReviewActionData>();
  const { milestone: m, history, assignment, payout } = detail;
  const pending = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.fieldErrors[FORM_LEVEL_KEY]?.join(" ") : null;

  if (payout) {
    return (
      <section aria-labelledby="payout-heading" className="flex flex-col gap-2 rounded-md border bg-card p-3">
        <h2 id="payout-heading" className="flex items-center gap-2 text-lg text-primary">
          <BadgeCheck aria-hidden="true" className="size-5" />
          Pago al productor confirmado
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Monto</dt>
          <dd className="tabular-nums">{formatMoney(payout.amount, payout.currency)}</dd>
          <dt className="text-muted-foreground">Comprobante</dt>
          <dd className="break-all font-mono">{payout.receiptId}</dd>
          <dt className="text-muted-foreground">Billetera destino</dt>
          <dd className="break-all">{payout.beneficiaryWallet}</dd>
          <dt className="text-muted-foreground">Fecha</dt>
          <dd>{formatDateTime(payout.paidAt)}</dd>
        </dl>
      </section>
    );
  }

  if (m.status !== "LABOR_PAYOUT_PENDING") return null;

  const signed = hasSignedApproval(history, assignment.verifierId);
  const allowed = canConfirmPayout(m.status, history, assignment.verifierId);
  const amount = formatMoney(m.laborBudget, m.currency);

  return (
    <section aria-labelledby="payout-heading" className="flex flex-col gap-3 rounded-md border bg-card p-3">
      <h2 id="payout-heading" className="text-lg text-primary">
        Pago de la línea del productor
      </h2>
      <p>
        El dictamen está aprobado. Falta confirmar el pago de mano de obra de <strong className="tabular-nums">{amount}</strong> a la billetera del productor.
      </p>
      {!signed && (
        <Alert variant="destructive">
          <AlertDescription>El pago está bloqueado: no hay un dictamen aprobado y firmado por el verificador asignado.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <fetcher.Form method="post" id="payout-form">
        <input type="hidden" name="intent" value="confirm-payout" />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" size="compact" disabled={!allowed || pending} className="self-start">
              <Banknote aria-hidden="true" />
              Confirmar pago al productor
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Confirmar el pago de {amount}?</AlertDialogTitle>
              <AlertDialogDescription>
                El pago sale de la billetera del inversor hacia la billetera del productor y queda registrado con su comprobante. Al confirmarlo se cierra el hito, se revoca su permiso de pago (grant) y se solicita el del hito siguiente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
              <AlertDialogAction size="compact" type="submit" form="payout-form">
                Confirmar pago
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </fetcher.Form>
    </section>
  );
}
