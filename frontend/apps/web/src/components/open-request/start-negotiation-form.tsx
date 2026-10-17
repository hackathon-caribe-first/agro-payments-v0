import { Send } from "lucide-react";
import { useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { BackingOption } from "@agro/shared/modules/presales/application/use-cases";
import { saleQuoteTotal } from "@agro/shared/modules/presales/domain/presale-rules";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Textarea } from "@agro/shared/ui/textarea";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { Field } from "~/components/presale/field";
import { formatQuantity, unitText, type UnitRef } from "~/components/presale/format";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { parseAmount } from "~/components/producer/project-form/amount";

interface Props {
  options: BackingOption[];
  unit: UnitRef;
  remaining: number;
  actionData?: PresaleActionData;
}

// The producer's first offer on an open request, backed by one of their own projects.
export function StartNegotiationForm({ options, unit, remaining, actionData }: Props) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  const [projectId, setProjectId] = useState(options[0]?.project.id ?? "");
  const [quantity, setQuantity] = useState(String(remaining));
  const [unitPrice, setUnitPrice] = useState("");

  const total = saleQuoteTotal(parseAmount(quantity) ?? 0, parseAmount(unitPrice) ?? 0);

  if (options.length === 0) {
    return (
      <p role="status" className="text-muted-foreground">
        Para ofertar necesitas un proyecto propio que respalde la oferta. Crea un proyecto y vuelve a esta solicitud.{" "}
        <Link to="/producer/projects/new" className="font-bold text-primary underline underline-offset-4">
          Crear un proyecto
        </Link>
      </p>
    );
  }

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="start" />

      <Field id="start-project" label="Proyecto que respalda la oferta" errors={errors.projectId}>
        {(aria) => (
          <Select
            name="projectId"
            value={projectId}
            onValueChange={(value) => {
              setProjectId(value);
              clear("projectId");
            }}
          >
            <SelectTrigger id="start-project" className="w-full" {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.project.id} value={o.project.id}>
                  {o.projectTitle}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
        <Field
          id="start-quantity"
          label={`Cantidad (${unitText(unit, 2)})`}
          errors={errors.quantity}
          hint={`Máximo ${formatQuantity(remaining, unit)}: lo pendiente por asignar.`}
        >
          {(aria) => (
            <Input
              id="start-quantity"
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
        <Field id="start-price" label="Precio unitario (COP)" errors={errors.unitPrice}>
          {(aria) => (
            <Input
              id="start-price"
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
        <Field id="start-valid" label="Vigente hasta" errors={errors.validUntil}>
          {(aria) => <Input id="start-valid" name="validUntil" type="date" onChange={() => clear("validUntil")} {...aria} />}
        </Field>
        <Field id="start-delivery" label="Entrega (opcional)" errors={errors.deliveryDate}>
          {(aria) => <Input id="start-delivery" name="deliveryDate" type="date" onChange={() => clear("deliveryDate")} {...aria} />}
        </Field>
      </div>

      <Field id="start-terms" label="Condiciones de entrega" errors={errors.deliveryTerms}>
        {(aria) => (
          <Textarea id="start-terms" name="deliveryTerms" rows={3} maxLength={500} onChange={() => clear("deliveryTerms")} {...aria} />
        )}
      </Field>

      <p aria-live="polite" className="text-sm">
        Total de la oferta: <span className="font-semibold tabular-nums">{formatMoney(total, "COP")}</span>
      </p>

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Send aria-hidden="true" />
        {pending ? "Enviando…" : "Enviar oferta"}
      </Button>
    </Form>
  );
}
