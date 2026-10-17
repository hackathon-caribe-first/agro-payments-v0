import { Plus, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import {
  AMOUNT_MODES,
  MANUAL_CONCEPTS,
  PAYMENT_MOMENTS,
  type AmountMode,
  type Beneficiary,
  type LineConcept,
  type PaymentLine,
  type PaymentMoment,
} from "@agro/shared/modules/payment-lines/domain/line";
import { parseMinorUnits, parsePercentBps, toInputText } from "@agro/shared/modules/payment-lines/domain/money";
import { canAddLine, lineValueProblem, type SplitContext } from "@agro/shared/modules/payment-lines/domain/split";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Field } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { CONCEPT_LABELS, MODE_LABELS, MOMENT_HINTS, MOMENT_LABELS, money, type SplitActionData } from "./copy";

interface Props {
  ctx: SplitContext;
  lines: PaymentLine[];
  beneficiaries: Beneficiary[];
  // The pending line being edited; null to add a new one.
  editing: PaymentLine | null;
  cancelTo: string;
  actionData?: SplitActionData;
}

const defaultMoment = (b: Beneficiary | undefined): PaymentMoment => (b?.role === "PRODUCER" ? "aprobacion" : "insumos");
// Imprevistos and the platform commission have their own flows, so this form only offers the manual concepts.
const conceptsFor = (b: Beneficiary | undefined): LineConcept[] =>
  b?.role === "PRODUCER" ? ["mano_de_obra"] : MANUAL_CONCEPTS.filter((c) => c !== "mano_de_obra");

// Add or edit one payment line. The cap is checked live, with the same rule the server applies.
export function LineForm({ ctx, lines, beneficiaries, editing, cancelTo, actionData }: Props) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";

  const first = editing?.beneficiary.id ?? beneficiaries.find((b) => b.role === "SUPPLIER")?.id ?? beneficiaries[0]?.id ?? "";
  const [beneficiaryId, setBeneficiaryId] = useState(first);
  const [concept, setConcept] = useState<LineConcept>(editing?.concept ?? conceptsFor(beneficiaries.find((b) => b.id === first))[0]);
  const [reference, setReference] = useState(editing?.reference ?? "");
  const [amountMode, setAmountMode] = useState<AmountMode>(editing?.amountMode ?? "fixed");
  const [amount, setAmount] = useState(
    editing ? (editing.amountMode === "percent" ? toInputText(editing.value, 2) : toInputText(editing.value, ctx.scale)) : "",
  );
  const [moment, setMoment] = useState<PaymentMoment>(editing?.moment ?? defaultMoment(beneficiaries.find((b) => b.id === first)));

  const beneficiary = beneficiaries.find((b) => b.id === beneficiaryId);
  const concepts = conceptsFor(beneficiary);

  // Live validation: the candidate against the milestone cap, using the pure domain rules.
  const live = useMemo(() => {
    if (!beneficiary || amount.trim() === "") return null;
    const value = amountMode === "percent" ? parsePercentBps(amount) : parseMinorUnits(amount, ctx.scale);
    if (value === null) {
      return { ok: false as const, message: amountMode === "percent" ? "Ingresa un porcentaje válido, con hasta dos decimales." : "Ingresa un monto válido." };
    }
    const problem = lineValueProblem(ctx, amountMode, value);
    if (problem) return { ok: false as const, message: problem };
    const candidate: PaymentLine = {
      id: editing?.id ?? "candidate",
      milestoneId: ctx.milestoneId,
      beneficiary,
      concept,
      reference,
      amountMode,
      value,
      moment,
      status: "pendiente",
      receiptId: null,
      createdAt: "",
    };
    const check = canAddLine(ctx, lines, candidate);
    return check.ok ? { ok: true as const, preview: check.preview } : { ok: false as const, message: check.message };
  }, [amount, amountMode, beneficiary, concept, ctx, editing?.id, lines, moment, reference]);

  const amountErrors = errors.amount ?? (live && !live.ok ? [live.message] : undefined);
  const percent = amountMode === "percent";

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={editing ? "update" : "add"} />
      {editing && <input type="hidden" name="lineId" value={editing.id} />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
        <Field id="line-beneficiary" label="Beneficiario" errors={errors.beneficiaryId}>
          {(aria) => (
            <Select
              name="beneficiaryId"
              value={beneficiaryId}
              onValueChange={(value) => {
                const next = beneficiaries.find((b) => b.id === value);
                setBeneficiaryId(value);
                setConcept(conceptsFor(next)[0]);
                setMoment(defaultMoment(next));
                clear("beneficiaryId");
                clear("concept");
              }}
            >
              <SelectTrigger id="line-beneficiary" className="w-full" {...aria}>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                {beneficiaries.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.role === "PRODUCER" ? `${b.name} (productor)` : b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field id="line-concept" label="Concepto" errors={errors.concept}>
          {(aria) => (
            <Select
              name="concept"
              value={concept}
              onValueChange={(value) => {
                setConcept(value as LineConcept);
                clear("concept");
              }}
            >
              <SelectTrigger id="line-concept" className="w-full" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {concepts.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CONCEPT_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        {concept !== "mano_de_obra" && (
          <Field id="line-reference" label={concept === "factura" ? "Número de factura" : "Número de orden"} errors={errors.reference}>
            {(aria) => (
              <Input
                id="line-reference"
                name="reference"
                autoComplete="off"
                maxLength={40}
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  clear("reference");
                }}
                {...aria}
              />
            )}
          </Field>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
        <Field id="line-mode" label="Cómo se define el monto" errors={errors.amountMode}>
          {(aria) => (
            <Select
              name="amountMode"
              value={amountMode}
              onValueChange={(value) => {
                setAmountMode(value as AmountMode);
                setAmount("");
                clear("amountMode");
                clear("amount");
              }}
            >
              <SelectTrigger id="line-mode" className="w-full" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AMOUNT_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field
          id="line-amount"
          label={percent ? "Porcentaje del tope (%)" : `Monto que recibe (${ctx.currency})`}
          errors={amountErrors}
          hint={percent ? "Los centavos sobrantes del redondeo van a la línea del productor." : "El beneficiario recibe exactamente este monto; la comisión la asume el inversor dentro del tope."}
        >
          {(aria) => (
            <Input
              id="line-amount"
              name="amount"
              inputMode={percent || ctx.scale > 0 ? "decimal" : "numeric"}
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(percent || ctx.scale > 0 ? /[^\d,.]/g : /\D/g, ""));
                clear("amount");
              }}
              {...aria}
            />
          )}
        </Field>

        <Field id="line-moment" label="Momento de pago" errors={errors.moment} hint={MOMENT_HINTS[moment]}>
          {(aria) => (
            <Select
              name="moment"
              value={moment}
              onValueChange={(value) => {
                setMoment(value as PaymentMoment);
                clear("moment");
              }}
            >
              <SelectTrigger id="line-moment" className="w-full" {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_MOMENTS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MOMENT_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <p aria-live="polite" className="text-sm">
        {live?.ok ? (
          <>
            Con esta línea el hito queda en <span className="font-semibold tabular-nums">{money(ctx, live.preview.totalDebit)}</span> de{" "}
            <span className="font-semibold tabular-nums">{money(ctx, ctx.cap)}</span>; sobran{" "}
            <span className="font-semibold tabular-nums">{money(ctx, live.preview.unspent)}</span> en la billetera del inversor.
          </>
        ) : (
          <span className="text-muted-foreground">Ingresa el monto para ver si cabe en el tope del hito.</span>
        )}
      </p>

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="compact" disabled={pending}>
          {editing ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Agregar línea"}
        </Button>
        {editing && (
          <Button asChild variant="outline" size="compact">
            <Link to={cancelTo}>Cancelar</Link>
          </Button>
        )}
      </div>
    </Form>
  );
}
