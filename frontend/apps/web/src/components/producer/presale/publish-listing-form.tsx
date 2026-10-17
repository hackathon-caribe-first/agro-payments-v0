import { Megaphone } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { UNITS } from "@agro/shared/modules/presales/domain/presale";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Textarea } from "@agro/shared/ui/textarea";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { Field, keepDigits } from "~/components/presale/field";
import { unitText } from "~/components/presale/format";
import { useFieldErrors } from "~/components/presale/use-field-errors";

export function PublishListingForm({ actionData }: { actionData?: PresaleActionData }) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="publish" />

      <Field id="listing-title" label="Título de la preventa" errors={errors.title}>
        {(aria) => <Input id="listing-title" name="title" maxLength={120} onChange={() => clear("title")} {...aria} />}
      </Field>
      <Field id="listing-summary" label="Resumen" errors={errors.summary}>
        {(aria) => <Textarea id="listing-summary" name="summary" rows={3} maxLength={1000} onChange={() => clear("summary")} {...aria} />}
      </Field>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
        <Field id="listing-quantity" label="Cantidad esperada" errors={errors.expectedQuantity}>
          {(aria) => (
            <Input
              id="listing-quantity"
              name="expectedQuantity"
              inputMode="numeric"
              autoComplete="off"
              onInput={keepDigits}
              onChange={() => clear("expectedQuantity")}
              {...aria}
            />
          )}
        </Field>
        <Field id="listing-unit" label="Unidad" errors={errors.unit}>
          {(aria) => (
            <Select name="unit" defaultValue="KG" onValueChange={() => clear("unit")}>
              <SelectTrigger id="listing-unit" className="w-full" {...aria}>
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
        <Field id="listing-price" label="Precio de referencia por unidad (COP)" errors={errors.referenceUnitPrice}>
          {(aria) => (
            <Input
              id="listing-price"
              name="referenceUnitPrice"
              inputMode="numeric"
              autoComplete="off"
              onInput={keepDigits}
              onChange={() => clear("referenceUnitPrice")}
              {...aria}
            />
          )}
        </Field>
        <Field id="listing-harvest" label="Fecha estimada de cosecha" errors={errors.estimatedHarvestDate}>
          {(aria) => (
            <Input id="listing-harvest" name="estimatedHarvestDate" type="date" onChange={() => clear("estimatedHarvestDate")} {...aria} />
          )}
        </Field>
      </div>

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Megaphone aria-hidden="true" />
        {pending ? "Publicando…" : "Publicar preventa"}
      </Button>
    </Form>
  );
}
