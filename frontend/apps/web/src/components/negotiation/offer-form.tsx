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
import { Field } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { parseAmount } from "~/components/producer/project-form/amount";

interface Props {
  // "respond" is the producer's first offer on a request; "counter" is any later round by either party.
  intent: "respond" | "counter";
  // Largest quantity the sender can offer and a hint that names the limit that binds.
  maxQuantity: number;
  capHint: string;
  initial?: { quantity?: number; unitPrice?: number };
  submitLabel: string;
  actionData?: PresaleActionData;
}

// One offer form for every round. The total comes from the same pure function the domain and the mock use.
export function OfferForm({ intent, maxQuantity, capHint, initial, submitLabel, actionData }: Props) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  const [quantity, setQuantity] = useState(String(Math.min(initial?.quantity ?? maxQuantity, maxQuantity)));
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice ? String(initial.unitPrice) : "");

  const total = saleQuoteTotal(parseAmount(quantity) ?? 0, parseAmount(unitPrice) ?? 0);

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={intent} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
        <Field id={`${intent}-quantity`} label="Cantidad" errors={errors.quantity} hint={capHint}>
          {(aria) => (
            <Input
              id={`${intent}-quantity`}
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
        <Field id={`${intent}-price`} label="Precio unitario (COP)" errors={errors.unitPrice}>
          {(aria) => (
            <Input
              id={`${intent}-price`}
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
        <Field id={`${intent}-valid`} label="Vigente hasta" errors={errors.validUntil}>
          {(aria) => <Input id={`${intent}-valid`} name="validUntil" type="date" onChange={() => clear("validUntil")} {...aria} />}
        </Field>
        {intent === "counter" && (
          <Field id={`${intent}-delivery`} label="Entrega (opcional)" errors={errors.deliveryDate}>
            {(aria) => <Input id={`${intent}-delivery`} name="deliveryDate" type="date" onChange={() => clear("deliveryDate")} {...aria} />}
          </Field>
        )}
      </div>

      <Field id={`${intent}-terms`} label="Condiciones de entrega" errors={errors.deliveryTerms}>
        {(aria) => (
          <Textarea id={`${intent}-terms`} name="deliveryTerms" rows={3} maxLength={500} onChange={() => clear("deliveryTerms")} {...aria} />
        )}
      </Field>

      <p aria-live="polite" className="text-sm">
        Total de la oferta: <span className="font-semibold tabular-nums">{formatMoney(total, "COP")}</span>
      </p>

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Send aria-hidden="true" />
        {pending ? "Enviando…" : submitLabel}
      </Button>
    </Form>
  );
}
