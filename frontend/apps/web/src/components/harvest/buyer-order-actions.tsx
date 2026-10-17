import { CircleCheck, ShieldCheck, ShieldOff, X } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import type { PurchaseOrder } from "@agro/shared/modules/harvest/domain/harvest";
import { canAuthorize, canCancel, canConfirmReception, canRevoke, isGrantRevoked } from "@agro/shared/modules/harvest/domain/rules";
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
import { Button } from "@agro/shared/ui/button";
import { forIntent, type HarvestActionData } from "~/harvest/action-data";
import { FormError } from "./form-error";

// Buyer's actions on an order. One primary action per state; irreversible ones ask first.
// The dialogs are portaled, so their buttons submit the hidden form by id.
export function BuyerOrderActions({ order, actionData }: { order: PurchaseOrder; actionData?: HarvestActionData }) {
  const pending = useNavigation().state !== "idle";
  const answer = forIntent(actionData, "confirm-reception", "revoke", "cancel");
  const money = formatMoney(order.total, order.currency);
  const revoked = isGrantRevoked(order) && (order.status === "PAYMENT_AUTHORIZED" || order.status === "DISPATCHED");

  return (
    <div className="flex flex-col gap-3">
      {revoked && (
        <p role="status" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          <span className="font-semibold">✕ Autorización revocada. </span>
          El productor no puede despachar y tú no puedes confirmar la recepción hasta que vuelvas a autorizar el pago.
        </p>
      )}
      {answer && <FormError errors={answer.fieldErrors} />}

      <div className="flex flex-wrap items-center gap-2">
        {canAuthorize(order) && (
          <Button asChild size="compact">
            <Link to={`/buyer/orders/${order.id}/authorize`}>
              <ShieldCheck aria-hidden="true" />
              {revoked ? "Volver a autorizar el pago" : "Autorizar pago de la orden"}
            </Link>
          </Button>
        )}

        {canConfirmReception(order) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" size="compact" disabled={pending}>
                <CircleCheck aria-hidden="true" />
                Confirmar recepción a satisfacción
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Confirmar que recibiste el pedido?</AlertDialogTitle>
                <AlertDialogDescription>
                  Al confirmar, la Plataforma paga {money} desde tu billetera repartido entre el inversor, el productor y la comisión. No se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                <AlertDialogAction size="compact" type="submit" form="confirm-reception-form">
                  Confirmar recepción
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canRevoke(order) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="compact" disabled={pending}>
                <ShieldOff aria-hidden="true" />
                Revocar autorización
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Revocar la autorización de pago?</AlertDialogTitle>
                <AlertDialogDescription>
                  El productor no podrá despachar y la orden no se podrá liquidar hasta que vuelvas a autorizar el pago. Tu dinero sigue en tu billetera.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                <AlertDialogAction size="compact" type="submit" form="revoke-form">
                  Revocar autorización
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {canCancel(order) && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" size="compact" disabled={pending}>
                <X aria-hidden="true" />
                Cancelar orden
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cancelar la orden?</AlertDialogTitle>
                <AlertDialogDescription>El lote vuelve a estar disponible en el mercado y se cierra tu autorización de pago, si existe.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
                <AlertDialogAction size="compact" type="submit" form="cancel-form">
                  Cancelar orden
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <Form method="post" id="confirm-reception-form">
        <input type="hidden" name="intent" value="confirm-reception" />
      </Form>
      <Form method="post" id="revoke-form">
        <input type="hidden" name="intent" value="revoke" />
      </Form>
      <Form method="post" id="cancel-form">
        <input type="hidden" name="intent" value="cancel" />
      </Form>
    </div>
  );
}
