import { useState } from "react";
import type { FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { UNITS, type Unit } from "@agro/shared/modules/presales/domain/presale";
import { saleQuoteTotal } from "@agro/shared/modules/presales/domain/presale-rules";
import { Input } from "@agro/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Textarea } from "@agro/shared/ui/textarea";
import { Field } from "~/components/presale/field";
import { unitText } from "~/components/presale/format";
import { parseAmount } from "~/components/producer/project-form/amount";

export interface ProjectTermsInitial {
  quantity?: number;
  unit?: Unit;
  unitPrice?: number;
  deliveryDate?: string;
  validUntil?: string;
  notes?: string;
}

interface Props {
  idPrefix: string;
  errors: FieldErrors;
  clear: (key: string) => void;
  initial?: ProjectTermsInitial;
}

// Terms of a PROJECT offer: quantity, unit, unit price, delivery date, validity and notes. There is no availability cap.
export function ProjectTermsFields({ idPrefix, errors, clear, initial }: Props) {
  const [quantity, setQuantity] = useState(initial?.quantity ? String(initial.quantity) : "");
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice ? String(initial.unitPrice) : "");
  // Same pure function as the domain and the mock; this value is only registered, it never changes the authorized total.
  const offerValue = saleQuoteTotal(parseAmount(quantity) ?? 0, parseAmount(unitPrice) ?? 0);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
        <Field id={`${idPrefix}-quantity`} label="Cantidad" errors={errors.quantity}>
          {(aria) => (
            <Input
              id={`${idPrefix}-quantity`}
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
        <Field id={`${idPrefix}-unit`} label="Unidad" errors={errors.unit}>
          {(aria) => (
            <Select name="unit" defaultValue={initial?.unit ?? "KG"} onValueChange={() => clear("unit")}>
              <SelectTrigger id={`${idPrefix}-unit`} className="w-full" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {unitText({ unit: u, rawUnit: u }, 2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id={`${idPrefix}-price`} label="Precio unitario (COP)" errors={errors.unitPrice}>
          {(aria) => (
            <Input
              id={`${idPrefix}-price`}
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
        <Field id={`${idPrefix}-delivery`} label="Fecha de entrega" errors={errors.deliveryDate}>
          {(aria) => (
            <Input
              id={`${idPrefix}-delivery`}
              name="deliveryDate"
              type="date"
              defaultValue={initial?.deliveryDate}
              onChange={() => clear("deliveryDate")}
              {...aria}
            />
          )}
        </Field>
        <Field id={`${idPrefix}-valid`} label="Vigente hasta" errors={errors.validUntil}>
          {(aria) => <Input id={`${idPrefix}-valid`} name="validUntil" type="date" defaultValue={initial?.validUntil} onChange={() => clear("validUntil")} {...aria} />}
        </Field>
      </div>

      <Field id={`${idPrefix}-notes`} label="Notas (opcional)" errors={errors.notes}>
        {(aria) => (
          <Textarea id={`${idPrefix}-notes`} name="notes" rows={3} maxLength={500} defaultValue={initial?.notes} onChange={() => clear("notes")} {...aria} />
        )}
      </Field>

      <p aria-live="polite" className="text-sm">
        Valor de la oferta: <span className="font-semibold tabular-nums">{formatMoney(offerValue, "COP")}</span>
        <span className="block text-muted-foreground">Solo se registra: el pago autorizado es el total de la cotización del proyecto.</span>
      </p>
    </>
  );
}
