import { ShieldCheck } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { formatKg, type PurchaseOrder } from "@agro/shared/modules/harvest-batches/domain/harvest";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { forIntent, type HarvestActionData } from "~/harvest-batches/action-data";
import { FormError } from "./form-error";

// Consent step: the buyer approves a grant capped at the order total. The money stays in the buyer's wallet.
export function AuthorizePanel({ order, actionData }: { order: PurchaseOrder; actionData?: HarvestActionData }) {
  const pending = useNavigation().state !== "idle";
  const answer = forIntent(actionData, "authorize");
  const total = formatMoney(order.total, order.currency);
  return (
    <section aria-labelledby="authorize-title" className="flex flex-col gap-5 rounded-lg border bg-card p-6">
      <div>
        <h2 id="authorize-title" className="text-xl text-primary">
          Autorizar pago de la orden
        </h2>
        <p className="mt-2 text-muted-foreground">
          {formatKg(order.quantityKg)} de {order.projectTitle}, a {formatMoney(order.unitPrice, order.currency)} por kilo.
        </p>
      </div>
      <dl className="rounded-md bg-muted p-4 text-sm">
        <dt className="text-muted-foreground">Tope de la autorización</dt>
        <dd className="text-xl font-semibold tabular-nums">{total}</dd>
      </dl>
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <li>Tu dinero se queda en tu billetera. No pagas nada ahora.</li>
        <li>La Plataforma solo podrá pagar hasta {total}, y únicamente después de que confirmes la recepción a satisfacción.</li>
        <li>Al terminar la liquidación, la autorización se revoca y lo que no se use sigue en tu billetera.</li>
        <li>Puedes revocarla antes de confirmar la recepción; en ese caso el productor no podrá despachar.</li>
      </ul>
      {answer && <FormError errors={answer.fieldErrors} />}
      <Form method="post" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="intent" value="authorize" />
        <input type="hidden" name="expectedTotal" value={order.total} />
        <Button type="submit" size="compact" disabled={pending}>
          <ShieldCheck aria-hidden="true" />
          {pending ? "Autorizando…" : `Autorizar hasta ${total}`}
        </Button>
        <Button asChild variant="outline" size="compact">
          <Link to={`/buyer/orders/${order.id}`}>Volver a la orden</Link>
        </Button>
      </Form>
    </section>
  );
}
