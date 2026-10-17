import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { formatKg, type HarvestBatch } from "@agro/shared/modules/harvest/domain/harvest";
import { orderTotal } from "@agro/shared/modules/harvest/domain/rules";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import type { HarvestActionData } from "~/harvest/action-data";
import { Field, keepDigits } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { FormError } from "./form-error";

// Purchase order: quantity up to the certified weight still available; total = price per kilo x quantity (integers).
export function CreateOrderForm({ lot, actionData }: { lot: HarvestBatch; actionData?: HarvestActionData }) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  const [quantity, setQuantity] = useState(String(lot.availableKg));
  const kg = /^\d+$/.test(quantity) ? Number(quantity) : 0;

  if (lot.availableKg <= 0 || lot.hasOpenOrder || lot.status !== "CERTIFIED_LISTED") {
    return (
      <p role="status" className="text-muted-foreground">
        {lot.hasOpenOrder ? "Este lote tiene una orden en curso. Vuelve más tarde." : "Este lote ya no tiene kilos disponibles."}
      </p>
    );
  }

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <Field id="order-quantity" label="Cantidad (kg)" errors={errors.quantityKg} hint={`Máximo ${formatKg(lot.availableKg)}: el peso certificado disponible.`}>
        {(aria) => (
          <Input
            id="order-quantity"
            name="quantityKg"
            inputMode="numeric"
            autoComplete="off"
            value={quantity}
            onInput={keepDigits}
            onChange={(e) => {
              setQuantity(e.target.value.replace(/\D/g, ""));
              clear("quantityKg");
            }}
            {...aria}
          />
        )}
      </Field>
      <p aria-live="polite" className="text-sm">
        Total de la orden: <span className="font-semibold tabular-nums">{formatMoney(orderTotal(kg, lot.askingPricePerKg), lot.currency)}</span>
      </p>
      <FormError errors={errors} />
      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <ShoppingCart aria-hidden="true" />
        {pending ? "Creando…" : "Crear orden de compra"}
      </Button>
    </Form>
  );
}
