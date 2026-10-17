import { ShieldCheck } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
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
import type { PresaleActionData } from "~/components/presale/error-copy";

// The buyer executes the pending payment authorization of an agreed project. It asks first, showing the total, and sends
// that total so the server can refuse a stale one. The dialog is portaled, hence the submit button targets the form by id.
export function AuthorizationConfirm({ total, currency = "COP", actionData }: { total: number; currency?: string; actionData?: PresaleActionData }) {
  const pending = useNavigation().state !== "idle";
  const error = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ") ?? actionData?.fieldErrors.expectedTotal?.join(" ");
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Form method="post" id="authorize-payment-form">
        <input type="hidden" name="intent" value="authorize-payment" />
        <input type="hidden" name="expectedTotal" value={total} />
      </Form>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" size="compact" disabled={pending} className="self-start">
            <ShieldCheck aria-hidden="true" />
            Autorizar pago
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Autorizar el pago del proyecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Autorizas a la plataforma a pagar hasta {formatMoney(total, currency)}. El dinero permanece en tu billetera; solo se paga al confirmar la recepción.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
            <AlertDialogAction size="compact" type="submit" form="authorize-payment-form">
              Autorizar pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
