import { Truck } from "lucide-react";
import { Form, useNavigation } from "react-router";
import type { PurchaseOrder } from "@agro/shared/modules/harvest/domain/harvest";
import { canDispatch, dispatchBlockedByRevocation } from "@agro/shared/modules/harvest/domain/rules";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { forIntent, type HarvestActionData } from "~/harvest/action-data";
import { Field } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { FormError } from "./form-error";

// Producer's dispatch with a transport guide. Only enabled while the buyer's authorization is live (PRD risk row).
export function DispatchForm({ order, actionData }: { order: PurchaseOrder; actionData?: HarvestActionData }) {
  const { formRef, errors, clear } = useFieldErrors(forIntent(actionData, "dispatch"));
  const pending = useNavigation().state !== "idle";

  if (dispatchBlockedByRevocation(order)) {
    return (
      <p role="status" className="rounded-md border border-destructive p-3 text-sm text-destructive">
        <span className="font-semibold">✕ Autorización revocada. </span>
        El comprador revocó el permiso de pago de esta orden. No despaches hasta que lo apruebe de nuevo: sin él no podemos cobrar la venta.
      </p>
    );
  }
  if (!canDispatch(order)) return null;

  const suggestedGuide = `GU-${order.id.replace(/\D/g, "").padStart(6, "0")}`;
  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="dispatch" />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <Field id="dispatch-carrier" label="Transportadora" errors={errors.carrier}>
          {(aria) => <Input id="dispatch-carrier" name="carrier" autoComplete="off" onChange={() => clear("carrier")} {...aria} />}
        </Field>
        <Field id="dispatch-guide" label="Número de guía" errors={errors.trackingNumber}>
          {(aria) => <Input id="dispatch-guide" name="trackingNumber" autoComplete="off" defaultValue={suggestedGuide} onChange={() => clear("trackingNumber")} {...aria} />}
        </Field>
      </div>
      <Field id="dispatch-photo" label="Foto del despacho (enlace)" errors={errors.photoUrl} hint="Foto de la carga o de la guía.">
        {(aria) => <Input id="dispatch-photo" name="photoUrl" type="url" placeholder="https://" autoComplete="off" onChange={() => clear("photoUrl")} {...aria} />}
      </Field>
      <FormError errors={errors} />
      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Truck aria-hidden="true" />
        {pending ? "Registrando…" : "Registrar despacho"}
      </Button>
    </Form>
  );
}
