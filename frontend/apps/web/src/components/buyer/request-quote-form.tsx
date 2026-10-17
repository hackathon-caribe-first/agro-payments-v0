import { Handshake } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Textarea } from "@agro/shared/ui/textarea";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { Field, keepDigits } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";

export function RequestQuoteForm({ available, unitText, actionData }: { available: number; unitText: string; actionData?: PresaleActionData }) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <Field id="request-quantity" label={`Cantidad (${unitText})`} errors={errors.quantity} hint={`Disponible: ${available}.`}>
        {(aria) => (
          <Input
            id="request-quantity"
            name="quantity"
            inputMode="numeric"
            autoComplete="off"
            onInput={keepDigits}
            onChange={() => clear("quantity")}
            {...aria}
          />
        )}
      </Field>
      <Field id="request-delivery" label="Fecha de entrega deseada" errors={errors.desiredDeliveryDate}>
        {(aria) => (
          <Input id="request-delivery" name="desiredDeliveryDate" type="date" onChange={() => clear("desiredDeliveryDate")} {...aria} />
        )}
      </Field>
      <Field id="request-notes" label="Notas (opcional)" errors={errors.notes}>
        {(aria) => <Textarea id="request-notes" name="notes" rows={3} maxLength={500} onChange={() => clear("notes")} {...aria} />}
      </Field>

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Handshake aria-hidden="true" />
        {pending ? "Enviando…" : "Solicitar cotización"}
      </Button>
    </Form>
  );
}
