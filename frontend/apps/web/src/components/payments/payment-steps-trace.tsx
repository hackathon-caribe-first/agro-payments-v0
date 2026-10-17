import { useLiveRevalidate } from "~/components/panel/live-status";
import { PaymentReceipt } from "~/components/payments/payment-receipt";
import { PaymentStepsFilters } from "~/components/trace/payment-timeline";
import type { PaymentStepsTraceData } from "~/trace/payment-steps";

// ponytail: live by polling the loader every 2 s (paused while the tab is hidden); SSE push if 2 s lag or load ever matters.
const STEPS_REFRESH_MS = 2000;

// Every payment as a receipt, newest first: which Open Payments step it is on, how long each took and its proof.
export function PaymentStepsTrace({ filter, view, error }: PaymentStepsTraceData) {
  useLiveRevalidate(STEPS_REFRESH_MS);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl text-primary">Traza de pagos</h1>
        <p className="max-w-prose text-pretty text-muted-foreground">
          Cada pago como un recibo: en qué paso de Open Payments va, cuánto tardó cada paso y el comprobante para buscarlo en la
          billetera.
        </p>
      </header>

      <PaymentStepsFilters view={view} filter={filter} />

      {error ? (
        <p role="alert" className="rounded-md border border-destructive bg-card px-4 py-3 font-semibold text-destructive">
          ✕ {error}
        </p>
      ) : (
        <section aria-labelledby="steps-payments" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="steps-payments" className="text-xl text-primary">
              Pagos, el más nuevo arriba
            </h2>
            <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
              {view.payments.length} de {view.total} pagos
            </p>
          </div>
          {view.payments.length === 0 ? (
            <p className="rounded-lg border bg-card p-5 text-muted-foreground">
              {view.total === 0 ? "Aún no hay pagos registrados en Open Payments." : "No hay pagos para este filtro."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {view.payments.map((p) => (
                <PaymentReceipt key={`${p.kind}:${p.paymentId}`} payment={p} projectLabel={p.projectId ? view.projectLabels[p.projectId] : undefined} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
