import { Check, Handshake, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatYield } from "@agro/shared/modules/investment-proposals/domain/proposal-rules";
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
import type { InvestmentActionData } from "./error-copy";

// What accepting fixes: the terms of the latest revision, which become the contract.
export interface AcceptSummary {
  amount: number;
  yieldBps: number;
  currency: string;
}

interface Props {
  // Latest SENT revision the turn holder may decide on; null when there is nothing to accept or reject.
  decidableRevision: number | null;
  // Whether the viewer may counter (turn holder).
  canCounter: boolean;
  // Only the investor withdraws.
  canWithdraw: boolean;
  // The counter-offer form, rendered inline when "Contraoferta" is toggled on.
  counterForm: React.ReactNode;
  accept: AcceptSummary;
  actionData?: InvestmentActionData;
}

// Actions of the party whose turn it is: Aceptar, Rechazar, Contraoferta; and Retirar for the investor.
export function DecisionBar({ decidableRevision, canCounter, canWithdraw, counterForm, accept, actionData }: Props) {
  const pending = useNavigation().state !== "idle";
  const [counterOpen, setCounterOpen] = useState(false);
  const error = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");

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
          <Form method="post" id="proposal-decision-form" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="revision" value={decidableRevision} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" size="compact" disabled={pending}>
                  <Check aria-hidden="true" />
                  Aceptar oferta
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Aceptar esta oferta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {`Se acordará una inversión de ${formatMoney(accept.amount, accept.currency)} con un rendimiento de ${formatYield(accept.yieldBps)} y se generará el contrato para que ambas partes lo firmen. Todavía no se mueve dinero.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                  <AlertDialogAction size="compact" type="submit" form="proposal-decision-form" name="intent" value="accept">
                    Aceptar y generar contrato
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button type="submit" name="intent" value="reject" variant="outline" size="compact" disabled={pending}>
              <X aria-hidden="true" />
              Rechazar
            </Button>
          </Form>
        )}

        {canCounter && (
          <Button type="button" variant="outline" size="compact" aria-expanded={counterOpen} onClick={() => setCounterOpen((open) => !open)}>
            <Handshake aria-hidden="true" />
            {counterOpen ? "Cerrar contraoferta" : "Contraoferta"}
          </Button>
        )}

        {canWithdraw && (
          <>
            <Form method="post" id="withdraw-proposal-form">
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
                  <AlertDialogTitle>¿Retirar esta propuesta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La propuesta quedará como retirada y ninguna de las partes podrá seguir ofertando. Esta acción no se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                  <AlertDialogAction size="compact" type="submit" form="withdraw-proposal-form">
                    Retirar propuesta
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
