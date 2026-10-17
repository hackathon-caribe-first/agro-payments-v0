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

// The buyer's open request. It cannot be edited afterwards, only closed.
export function OpenRequestForm({ actionData }: { actionData?: PresaleActionData }) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <Field id="open-title" label="Título" errors={errors.title}>
        {(aria) => <Input id="open-title" name="title" maxLength={120} onChange={() => clear("title")} {...aria} />}
      </Field>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
        <Field id="open-type" label="Tipo de producción" errors={errors.productionType}>
          {(aria) => <Input id="open-type" name="productionType" maxLength={60} onChange={() => clear("productionType")} {...aria} />}
        </Field>
        <Field id="open-quantity" label="Cantidad" errors={errors.quantity}>
          {(aria) => (
            <Input
              id="open-quantity"
              name="quantity"
              inputMode="numeric"
              autoComplete="off"
              onInput={keepDigits}
              onChange={() => clear("quantity")}
              {...aria}
            />
          )}
        </Field>
        <Field id="open-unit" label="Unidad" errors={errors.unit}>
          {(aria) => (
            <Select name="unit" defaultValue="KG" onValueChange={() => clear("unit")}>
              <SelectTrigger id="open-unit" className="w-full" {...aria}>
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
        <Field id="open-price" label="Precio objetivo por unidad (COP, opcional)" errors={errors.targetUnitPrice}>
          {(aria) => (
            <Input
              id="open-price"
              name="targetUnitPrice"
              inputMode="numeric"
              autoComplete="off"
              onInput={keepDigits}
              onChange={() => clear("targetUnitPrice")}
              {...aria}
            />
          )}
        </Field>
        <Field id="open-delivery" label="Fecha de entrega" errors={errors.deliveryDate}>
          {(aria) => <Input id="open-delivery" name="deliveryDate" type="date" onChange={() => clear("deliveryDate")} {...aria} />}
        </Field>
        <Field id="open-location" label="Lugar de entrega" errors={errors.deliveryLocation}>
          {(aria) => <Input id="open-location" name="deliveryLocation" maxLength={120} onChange={() => clear("deliveryLocation")} {...aria} />}
        </Field>
      </div>

      <Field id="open-notes" label="Notas (opcional)" errors={errors.notes}>
        {(aria) => <Textarea id="open-notes" name="notes" rows={3} maxLength={500} onChange={() => clear("notes")} {...aria} />}
      </Field>

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Megaphone aria-hidden="true" />
        {pending ? "Publicando…" : "Publicar solicitud abierta"}
      </Button>
    </Form>
  );
}
