import { Send } from "lucide-react";
import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { MAX_YIELD_BPS, formatYield, isoToday, parseYieldBps, yieldAmount, yieldToInput } from "@agro/shared/modules/investments/domain/proposal-rules";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Textarea } from "@agro/shared/ui/textarea";
import { Field } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { parseAmount } from "~/components/producer/project-form/amount";
import type { InvestmentActionData } from "./error-copy";

interface Props {
  // "propose" is the investor's opening proposal; "counter" is any later round by either party.
  intent: "propose" | "counter";
  // The project quotation total: the largest amount a proposal can carry.
  maxAmount: number;
  currency: string;
  initial?: { amount?: number; yieldBps?: number; validUntil?: string; notes?: string };
  submitLabel: string;
  actionData?: InvestmentActionData;
}

const defaultValidUntil = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return isoToday(date);
};

// One proposal form for every round. Amount in whole COP, yield as a percentage (hasta dos decimales); the live figure
// comes from the same integer math the domain and the mock use.
export function ProposalForm({ intent, maxAmount, currency, initial, submitLabel, actionData }: Props) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [yieldText, setYieldText] = useState(initial?.yieldBps ? yieldToInput(initial.yieldBps) : "");

  const amountValue = parseAmount(amount);
  const bps = parseYieldBps(yieldText);
  const preview = amountValue !== null && bps !== null && bps > 0 ? yieldAmount(amountValue, bps) : null;
  const formError = errors[FORM_LEVEL_KEY]?.join(" ");

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={intent} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
        <Field
          id={`${intent}-amount`}
          label={`Monto a invertir (${currency})`}
          errors={errors.amount}
          hint={`Máximo ${formatMoney(maxAmount, currency)}, el total de la cotización del proyecto.`}
        >
          {(aria) => (
            <Input
              id={`${intent}-amount`}
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/\D/g, ""));
                clear("amount");
              }}
              {...aria}
            />
          )}
        </Field>
        <Field
          id={`${intent}-yield`}
          label="Rendimiento pactado (%)"
          errors={errors.yieldPercent}
          hint={`Sobre el capital, hasta ${formatYield(MAX_YIELD_BPS)}. Ejemplo: 12 o 12,5.`}
        >
          {(aria) => (
            <Input
              id={`${intent}-yield`}
              name="yieldPercent"
              inputMode="decimal"
              autoComplete="off"
              value={yieldText}
              onChange={(e) => {
                setYieldText(e.target.value.replace(/[^\d.,]/g, ""));
                clear("yieldPercent");
              }}
              {...aria}
            />
          )}
        </Field>
        <Field id={`${intent}-valid`} label="Vigente hasta" errors={errors.validUntil}>
          {(aria) => (
            <Input
              id={`${intent}-valid`}
              name="validUntil"
              type="date"
              defaultValue={initial?.validUntil && initial.validUntil >= isoToday() ? initial.validUntil : defaultValidUntil()}
              onChange={() => clear("validUntil")}
              {...aria}
            />
          )}
        </Field>
      </div>

      <Field id={`${intent}-notes`} label="Notas (opcional)" errors={errors.notes}>
        {(aria) => <Textarea id={`${intent}-notes`} name="notes" rows={3} maxLength={500} defaultValue="" onChange={() => clear("notes")} {...aria} />}
      </Field>

      <p aria-live="polite" className="text-sm">
        {preview !== null && amountValue !== null ? (
          <>
            Rendimiento estimado: <span className="font-semibold tabular-nums">{formatMoney(preview, currency)}</span> sobre{" "}
            <span className="tabular-nums">{formatMoney(amountValue, currency)}</span>
          </>
        ) : (
          "Ingresa el monto y el rendimiento para ver el rendimiento estimado."
        )}
      </p>

      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Send aria-hidden="true" />
        {pending ? "Enviando…" : submitLabel}
      </Button>
    </Form>
  );
}
