import { BadgeCheck, MessageSquareWarning } from "lucide-react";
import { Form, useNavigation } from "react-router";
import type { HarvestBatch } from "@agro/shared/modules/harvest/domain/harvest";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Textarea } from "@agro/shared/ui/textarea";
import { forIntent, type HarvestActionData } from "~/harvest/action-data";
import { Field, keepDigits } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { FormError } from "./form-error";
import { errorId } from "~/components/producer/project-form/field-error";

// Verifier's dictamen on the declared harvest. Approving lists the lot in the marketplace.
export function CertifyForm({ batch, actionData }: { batch: HarvestBatch; actionData?: HarvestActionData }) {
  const { formRef, errors, clear } = useFieldErrors(forIntent(actionData, "certify"));
  const pending = useNavigation().state !== "idle";
  const declared = batch.qualityMetrics;

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="certify" />
      <Field
        id="certify-kg"
        label="Peso certificado (kg)"
        errors={errors.certifiedKg}
        hint={`El productor declaró ${new Intl.NumberFormat("es-CO").format(batch.declaredKg)} kg; no puedes certificar más.`}
      >
        {(aria) => <Input id="certify-kg" name="certifiedKg" inputMode="numeric" autoComplete="off" defaultValue={batch.declaredKg} onInput={keepDigits} onChange={() => clear("certifiedKg")} {...aria} />}
      </Field>
      <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Calidad verificada</legend>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-4">
          <Field id="certify-humidity" label="Humedad (%)" errors={errors.humidityPct}>
            {(aria) => <Input id="certify-humidity" name="humidityPct" inputMode="decimal" autoComplete="off" defaultValue={declared.humidity_pct ?? ""} onChange={() => clear("humidityPct")} {...aria} />}
          </Field>
          <Field id="certify-score" label="Puntaje de calidad (0 a 100)" errors={errors.score}>
            {(aria) => <Input id="certify-score" name="score" inputMode="numeric" autoComplete="off" defaultValue={declared.score ?? ""} onInput={keepDigits} onChange={() => clear("score")} {...aria} />}
          </Field>
          <Field id="certify-cert" label="Certificación (opcional)" errors={errors.certification}>
            {(aria) => <Input id="certify-cert" name="certification" autoComplete="off" maxLength={80} defaultValue={String(declared.certification ?? "")} onChange={() => clear("certification")} {...aria} />}
          </Field>
        </div>
      </fieldset>
      <Field id="certify-comments" label="Comentarios del dictamen" errors={errors.comments}>
        {(aria) => <Textarea id="certify-comments" name="comments" rows={3} maxLength={1000} onChange={() => clear("comments")} {...aria} />}
      </Field>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="certify-signed" className="flex items-start gap-2 text-sm">
          <input
            id="certify-signed"
            name="signed"
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            onChange={() => clear("signed")}
            {...(errors.signed?.length ? { "aria-invalid": true, "aria-describedby": errorId("certify-signed") } : {})}
          />
          Firmo este dictamen: certifico la cantidad y la calidad indicadas.
        </label>
        {errors.signed?.length ? (
          <p id={errorId("certify-signed")} role="alert" className="text-sm font-semibold text-destructive">
            ✕ {errors.signed.join(" ")}
          </p>
        ) : null}
      </div>
      <FormError errors={errors} />
      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <BadgeCheck aria-hidden="true" />
        {pending ? "Firmando…" : "Certificar y publicar el lote"}
      </Button>
    </Form>
  );
}

// Observed opinion: the producer has to correct and resubmit.
export function CorrectionsForm({ actionData }: { actionData?: HarvestActionData }) {
  const { formRef, errors, clear } = useFieldErrors(forIntent(actionData, "corrections"));
  const pending = useNavigation().state !== "idle";
  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="corrections" />
      <Field id="corrections-comments" label="Qué debe corregir el productor" errors={errors.comments}>
        {(aria) => <Textarea id="corrections-comments" name="comments" rows={3} maxLength={1000} onChange={() => clear("comments")} {...aria} />}
      </Field>
      <FormError errors={errors} />
      <Button type="submit" variant="outline" size="compact" disabled={pending} className="self-start">
        <MessageSquareWarning aria-hidden="true" />
        Dictamen observado: pedir correcciones
      </Button>
    </Form>
  );
}
