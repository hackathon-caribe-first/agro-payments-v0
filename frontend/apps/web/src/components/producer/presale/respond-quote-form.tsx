import { Send } from "lucide-react";
import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { saleQuoteTotal } from "@agro/shared/modules/presales/domain/presale-rules";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Textarea } from "@agro/shared/ui/textarea";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { Field, keepDigits } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { parseAmount } from "~/components/producer/project-form/amount";

type Props = {
  // Largest quantity the producer can quote: the smaller of what was requested and what is still available.
  maxQuantity: number;
  actionData?: PresaleActionData;
};

export function RespondQuoteForm({ maxQuantity, actionData }: Props) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  const [quantity, setQuantity] = useState(String(maxQuantity));
  const [unitPrice, setUnitPrice] = useState("");

  // The same pure function the domain and the mock use.
  const total = saleQuoteTotal(parseAmount(quantity) ?? 0, parseAmount(unitPrice) ?? 0);

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="respond" />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
        <Field id="quote-quantity" label="Cantidad a ofrecer" errors={errors.quantity} hint={`Máximo ${maxQuantity}.`}>
          {(aria) => (
            <Input
              id="quote-quantity"
              name="quantity"
              inputMode="numeric"
              autoComplete="off"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value.replace(/\D/g, ""));
                clear("quantity");
              }}
              {...aria}
            />
          )}
        </Field>
        <Field id="quote-price" label="Precio unitario (COP)" errors={errors.unitPrice}>
          {(aria) => (
            <Input
              id="quote-price"
              name="unitPrice"
              inputMode="numeric"
              autoComplete="off"
              value={unitPrice}
              onChange={(e) => {
                setUnitPrice(e.target.value.replace(/\D/g, ""));
                clear("unitPrice");
              }}
              {...aria}
            />
          )}
        </Field>
        <Field id="quote-valid" label="Vigente hasta" errors={errors.validUntil}>
          {(aria) => <Input id="quote-valid" name="validUntil" type="date" onChange={() => clear("validUntil")} {...aria} />}
        </Field>
      </div>

      <Field id="quote-terms" label="Condiciones de entrega" errors={errors.deliveryTerms}>
        {(aria) => (
          <Textarea id="quote-terms" name="deliveryTerms" rows={3} maxLength={500} onChange={() => clear("deliveryTerms")} {...aria} />
        )}
      </Field>

      <p aria-live="polite" className="text-sm">
        Total de la cotización: <span className="font-semibold tabular-nums">{formatMoney(total, "COP")}</span>
      </p>

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Send aria-hidden="true" />
        {pending ? "Enviando…" : "Enviar cotización de venta"}
      </Button>
    </Form>
  );
}
