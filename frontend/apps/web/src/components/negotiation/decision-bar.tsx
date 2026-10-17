import { Check, Handshake, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
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
import type { PresaleActionData } from "~/components/presale/error-copy";

// Accepting a PROJECT offer fixes the total of the project quotation: both parties confirm it first.
// `deposit` is true when the accepting party is the buyer, whose acceptance deposits in the same step.
export interface AcceptConfirm {
  total: number;
  deposit: boolean;
  currency?: string;
}

interface Props {
  // Latest SENT offer the turn holder may decide on; null when there is nothing to accept or reject.
  decidableRevision: number | null;
  // Whether the viewer may counter (turn holder).
  canCounter: boolean;
  // Either party may withdraw while the negotiation is not over.
  canWithdraw: boolean;
  // The counter-offer form, rendered inline when "Contraoferta" is toggled on.
  counterForm: React.ReactNode;
  // Present for PROJECT-scope offers only: accepting asks for confirmation and sends the total the user saw.
  acceptConfirm?: AcceptConfirm;
  actionData?: PresaleActionData;
}

// Actions of the party whose turn it is: Aceptar, Rechazar, Contraoferta; and Retirar for either party.
export function DecisionBar({ decidableRevision, canCounter, canWithdraw, counterForm, acceptConfirm, actionData }: Props) {
  const pending = useNavigation().state !== "idle";
  const [counterOpen, setCounterOpen] = useState(false);
  const error = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ") ?? actionData?.fieldErrors.expectedTotal?.join(" ");

  if (decidableRevision === null && !canCounter && !canWithdraw) return null;

  return (
    <div className="flex flex-col gap-3">
      {error && !counterOpen && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {decidableRevision !== null && (
          <Form method="post" id="decision-form" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="revision" value={decidableRevision} />
            {acceptConfirm && <input type="hidden" name="expectedTotal" value={acceptConfirm.total} />}
            {acceptConfirm ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" size="compact" disabled={pending}>
                    <Check aria-hidden="true" />
                    Aceptar oferta
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{acceptConfirm.deposit ? "¿Aceptar y depositar en la fiducia?" : "¿Aceptar el acuerdo?"}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {acceptConfirm.deposit
                        ? `Al aceptar, depositarás el total de la cotización del proyecto: ${formatMoney(acceptConfirm.total, acceptConfirm.currency ?? "COP")}. El monto queda en la fiducia y la acción no se puede deshacer.`
                        : `El total de la cotización del proyecto es ${formatMoney(acceptConfirm.total, acceptConfirm.currency ?? "COP")}. Al aceptar, el acuerdo queda cerrado y el comprador deberá depositar ese monto en la fiducia. La acción no se puede deshacer.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                    <AlertDialogAction size="compact" type="submit" form="decision-form" name="intent" value="accept">
                      {acceptConfirm.deposit ? "Aceptar y depositar en la fiducia" : "Aceptar acuerdo"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button type="submit" name="intent" value="accept" size="compact" disabled={pending}>
                <Check aria-hidden="true" />
                Aceptar oferta
              </Button>
            )}
            <Button type="submit" name="intent" value="reject" variant="outline" size="compact" disabled={pending}>
              <X aria-hidden="true" />
              Rechazar
            </Button>
          </Form>
        )}

        {canCounter && (
          <Button
            type="button"
            variant="outline"
            size="compact"
            aria-expanded={counterOpen}
            onClick={() => setCounterOpen((open) => !open)}
          >
            <Handshake aria-hidden="true" />
            {counterOpen ? "Cerrar contraoferta" : "Contraoferta"}
          </Button>
        )}

        {canWithdraw && (
          <>
            <Form method="post" id="withdraw-negotiation-form">
              <input type="hidden" name="intent" value="withdraw" />
            </Form>
            {/* Withdrawing cannot be undone, so it asks first. The dialog is portaled, hence the submit targets the form by id. */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="compact" disabled={pending}>
                  <Undo2 aria-hidden="true" />
                  Retirar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Retirar esta negociación?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La negociación quedará como retirada y ninguna de las partes podrá seguir ofertando. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                  <AlertDialogAction size="compact" type="submit" form="withdraw-negotiation-form">
                    Retirar negociación
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>

      {canCounter && counterOpen && <div className="rounded-lg border bg-card p-4">{counterForm}</div>}
    </div>
  );
}
