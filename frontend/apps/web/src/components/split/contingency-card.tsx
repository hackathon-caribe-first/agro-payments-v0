import { HandCoins } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import type { Beneficiary } from "@agro/shared/modules/payment-lines/domain/line";
import { formatBps, mulDivFloor } from "@agro/shared/modules/payment-lines/domain/money";
import type { SplitContext, SplitPreview } from "@agro/shared/modules/payment-lines/domain/split";
import { CONTINGENCY_REASON_MAX } from "@agro/shared/modules/payment-lines/schemas/contingency";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Input } from "@agro/shared/ui/input";
import { Progress } from "@agro/shared/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Field } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { money, type SplitActionData } from "./copy";

interface Props {
  ctx: SplitContext;
  preview: SplitPreview;
  beneficiaries: Beneficiary[];
  // Whether the milestone still accepts requests (a closed milestone does not).
  open: boolean;
  actionData?: SplitActionData;
}

// RF-21 / D-05: the reserve lives INSIDE the milestone cap; only a request of this card can spend it.
export function ContingencyCard({ ctx, preview, beneficiaries, open, actionData }: Props) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  const hasReserve = preview.reserve > 0;
  const usedPercent = hasReserve ? Math.min(100, mulDivFloor(preview.reserveUsed, 100, preview.reserve)) : 0;
  const formErrors = errors[FORM_LEVEL_KEY];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg text-primary">Fondo de imprevistos</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!hasReserve ? (
          <p className="text-sm text-muted-foreground">Este proyecto no definió un fondo de imprevistos para sus hitos.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Una parte del tope del hito ({formatBps(mulDivFloor(preview.reserve, 10000, Math.max(preview.cap, 1)))}) queda reservada para gastos que no se pueden prever. Las líneas
              normales no pueden usarla.
            </p>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 text-sm" aria-live="polite">
              <div>
                <dt className="text-muted-foreground">Reserva</dt>
                <dd className="font-semibold tabular-nums">{money(ctx, preview.reserve)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Usado</dt>
                <dd className="font-semibold tabular-nums">{money(ctx, preview.reserveUsed)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Disponible</dt>
                <dd className="font-semibold tabular-nums">{money(ctx, preview.reserveAvailable)}</dd>
              </div>
            </dl>
            <Progress value={usedPercent} aria-label="Porcentaje del fondo de imprevistos usado" />

            {open ? (
              <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
                <input type="hidden" name="intent" value="contingency" />
                <h3 className="text-base font-semibold text-primary">Solicitar fondos de imprevistos</h3>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
                  <Field id="contingency-beneficiary" label="Beneficiario" errors={errors.beneficiaryId}>
                    {(aria) => (
                      <Select name="beneficiaryId" defaultValue={beneficiaries.find((b) => b.role === "SUPPLIER")?.id ?? beneficiaries[0]?.id} onValueChange={() => clear("beneficiaryId")}>
                        <SelectTrigger id="contingency-beneficiary" className="w-full" {...aria}>
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
                  <Field id="contingency-amount" label={`Monto que recibe (${ctx.currency})`} errors={errors.amount} hint={`Máximo ${money(ctx, preview.reserveAvailable)}, comisión incluida.`}>
                    {(aria) => (
                      <Input
                        id="contingency-amount"
                        name="amount"
                        inputMode={ctx.scale > 0 ? "decimal" : "numeric"}
                        autoComplete="off"
                        onChange={() => clear("amount")}
                        {...aria}
                      />
                    )}
                  </Field>
                </div>
                <Field id="contingency-reason" label="Motivo del imprevisto" errors={errors.reason}>
                  {(aria) => <Input id="contingency-reason" name="reason" autoComplete="off" maxLength={CONTINGENCY_REASON_MAX} onChange={() => clear("reason")} {...aria} />}
                </Field>
                {formErrors?.length ? (
                  <Alert variant="destructive">
                    <AlertDescription>{formErrors.join(" ")}</AlertDescription>
                  </Alert>
                ) : null}
                <div>
                  <Button type="submit" size="compact" disabled={pending || preview.reserveAvailable < 1}>
                    <HandCoins aria-hidden="true" />
                    {pending ? "Solicitando…" : "Solicitar fondos de imprevistos"}
                  </Button>
                </div>
              </Form>
            ) : (
              <p className="text-sm text-muted-foreground">Este hito ya está cerrado: no admite más solicitudes.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
