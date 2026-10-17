import { useState } from "react";
import type { FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Input } from "@agro/shared/ui/input";
import { Textarea } from "@agro/shared/ui/textarea";
import { Field } from "~/components/presale/field";
import { parseAmount } from "~/components/producer/project-form/amount";

export interface MilestoneTermsInitial {
  price?: number;
  deliveryDate?: string;
  notes?: string;
}

interface Props {
  idPrefix: string;
  errors: FieldErrors;
  clear: (key: string) => void;
  initial?: MilestoneTermsInitial;
  // The milestone's budget (supplies + labor): shown as the reference the price is compared with.
  reference: number;
}

// Terms of a MILESTONE offer: a lump-sum price, a date and notes. There is no validity: milestone offers never expire.
export function MilestoneTermsFields({ idPrefix, errors, clear, initial, reference }: Props) {
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const difference = (parseAmount(price) ?? 0) - reference;
  const diffText = difference === 0 ? "Igual al presupuesto" : `${difference > 0 ? "+" : "−"}${formatMoney(Math.abs(difference), "COP")}`;

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
        <Field
          id={`${idPrefix}-price`}
          label="Precio del hito (COP)"
          errors={errors.price}
          hint={`Presupuesto de referencia: ${formatMoney(reference, "COP")}.`}
        >
          {(aria) => (
            <Input
              id={`${idPrefix}-price`}
              name="price"
              inputMode="numeric"
              autoComplete="off"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value.replace(/\D/g, ""));
                clear("price");
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
      </div>

      <Field id={`${idPrefix}-notes`} label="Notas (opcional)" errors={errors.notes}>
        {(aria) => (
          <Textarea id={`${idPrefix}-notes`} name="notes" rows={3} maxLength={500} defaultValue={initial?.notes} onChange={() => clear("notes")} {...aria} />
        )}
      </Field>

      <p aria-live="polite" className="text-sm">
        Diferencia frente al presupuesto: <span className="font-semibold tabular-nums">{diffText}</span>
      </p>
    </>
  );
}
