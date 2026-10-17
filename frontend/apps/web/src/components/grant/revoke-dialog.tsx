import { Ban } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { REVOCATION_REASONS, type MilestoneGrant } from "@agro/shared/modules/grants/domain/grant";
import { remainingCap } from "@agro/shared/modules/grants/domain/grant-rules";
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
import type { GrantActionData } from "./error-copy";
import { revocationReasonText } from "./status";

const FORM_ID = "revoke-grant-form";

// Revoking is irreversible: it asks first, names the reason (one of the four allowed cases) and says what stays in the wallet.
// The dialog is portaled, so the radios and the submit button target the form by id.
export function RevokeDialog({ grant, actionData }: { grant: MilestoneGrant; actionData?: GrantActionData }) {
  const pending = useNavigation().state !== "idle";
  const reasonError = actionData?.fieldErrors.reason?.join(" ");
  const formError = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  return (
    <div className="flex flex-col gap-3">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Form method="post" id={FORM_ID}>
        <input type="hidden" name="intent" value="revoke" />
      </Form>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="compact" disabled={pending} className="self-start">
            <Ban aria-hidden="true" />
            Revocar grant
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar este grant?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cancela el permiso de pago de la plataforma sobre tu billetera y no se podrá reactivar. Se quedan en tu billetera{" "}
              {formatMoney(remainingCap(grant), grant.currency)} que no se han gastado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <fieldset aria-describedby={reasonError ? "revoke-reason-error" : undefined} className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Motivo de la revocación</legend>
            {REVOCATION_REASONS.map((reason, i) => (
              <label key={reason} className="flex items-center gap-2 text-sm">
                <input type="radio" name="reason" value={reason} form={FORM_ID} defaultChecked={i === 0} aria-invalid={reasonError ? true : undefined} />
                {revocationReasonText(reason)}
              </label>
            ))}
            {reasonError && (
              <p id="revoke-reason-error" role="alert" className="text-sm text-destructive">
                {reasonError}
              </p>
            )}
          </fieldset>
          <AlertDialogFooter>
            <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
            <AlertDialogAction size="compact" type="submit" form={FORM_ID}>
              Revocar grant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
