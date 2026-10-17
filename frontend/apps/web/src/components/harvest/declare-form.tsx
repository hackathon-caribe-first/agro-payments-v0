import { Send } from "lucide-react";
import { Form, useNavigation } from "react-router";
import type { HarvestBatch } from "@agro/shared/modules/harvest/domain/harvest";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Textarea } from "@agro/shared/ui/textarea";
import type { HarvestActionData } from "~/harvest/action-data";
import { Field, keepDigits } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { FormError } from "./form-error";

// Declaration of the harvested volume and its quality payload. Also used to answer the verifier's corrections (`resubmit`).
export function DeclareForm({ resubmit, actionData }: { resubmit?: HarvestBatch; actionData?: HarvestActionData }) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  const metrics = resubmit?.qualityMetrics ?? {};

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={resubmit ? "resubmit" : "declare"} />
      {resubmit && <input type="hidden" name="batchId" value={resubmit.id} />}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <Field id="harvest-kg" label="Volumen cosechado (kg)" errors={errors.harvestedKg} hint="Número entero, sin puntos ni comas.">
          {(aria) => (
            <Input id="harvest-kg" name="harvestedKg" inputMode="numeric" autoComplete="off" defaultValue={resubmit?.declaredKg ?? ""} onInput={keepDigits} onChange={() => clear("harvestedKg")} {...aria} />
          )}
        </Field>
        <Field id="harvest-price" label="Precio de venta por kilo (COP)" errors={errors.askingPricePerKg}>
          {(aria) => (
            <Input id="harvest-price" name="askingPricePerKg" inputMode="numeric" autoComplete="off" defaultValue={resubmit?.askingPricePerKg ?? ""} onInput={keepDigits} onChange={() => clear("askingPricePerKg")} {...aria} />
          )}
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Calidad de la cosecha</legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-4">
          <Field id="harvest-humidity" label="Humedad (%)" errors={errors.humidityPct} hint="Máximo un decimal.">
            {(aria) => (
              <Input id="harvest-humidity" name="humidityPct" inputMode="decimal" autoComplete="off" defaultValue={metrics.humidity_pct ?? ""} onChange={() => clear("humidityPct")} {...aria} />
            )}
          </Field>
          <Field id="harvest-score" label="Puntaje de calidad (0 a 100)" errors={errors.score}>
            {(aria) => (
              <Input id="harvest-score" name="score" inputMode="numeric" autoComplete="off" defaultValue={metrics.score ?? ""} onInput={keepDigits} onChange={() => clear("score")} {...aria} />
            )}
          </Field>
          <Field id="harvest-cert" label="Certificación (opcional)" errors={errors.certification}>
            {(aria) => (
              <Input id="harvest-cert" name="certification" autoComplete="off" maxLength={80} defaultValue={String(metrics.certification ?? "")} onChange={() => clear("certification")} {...aria} />
            )}
          </Field>
        </div>
      </fieldset>

      <Field id="harvest-notes" label="Observaciones (opcional)" errors={errors.notes}>
        {(aria) => <Textarea id="harvest-notes" name="notes" rows={3} maxLength={1000} defaultValue={resubmit?.notes ?? ""} onChange={() => clear("notes")} {...aria} />}
      </Field>

      <Field id="harvest-photos" label="Fotos de la cosecha (opcional)" errors={errors.photoUrls} hint="Un enlace por línea, hasta 6.">
        {(aria) => (
          <Textarea id="harvest-photos" name="photoUrls" rows={3} placeholder="https://" defaultValue={resubmit?.photoUrls.join("\n") ?? ""} onChange={() => clear("photoUrls")} {...aria} />
        )}
      </Field>

      <FormError errors={errors} />

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Send aria-hidden="true" />
        {pending ? "Enviando…" : resubmit ? "Enviar correcciones" : "Declarar cosecha"}
      </Button>
    </Form>
  );
}
