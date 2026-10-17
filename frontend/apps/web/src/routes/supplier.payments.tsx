import { Link } from "react-router";
import { formatAmount } from "@agro/shared/modules/payment-lines/domain/money";
import type { SupplierPayment } from "@agro/shared/modules/payment-lines/application/payment-lines-repository";
import { currentSession } from "~/auth/guard";
import { CONCEPT_LABELS, MOMENT_LABELS, splitErrorMessage } from "~/components/split/copy";
import { LineStatusBadge } from "~/components/split/line-status-badge";
import { supplierLines } from "~/payment-lines/module";
import type { Route } from "./+types/supplier.payments";

export const meta = () => [{ title: "Mis cobros · Surco" }];

export async function clientLoader() {
  const session = await currentSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });
  // The supplier is always the one of the session: the id never comes from the URL.
  const result = await supplierLines.listMyPayments(session.profileId);
  if (!result.ok) throw new Response(splitErrorMessage(result.error), { status: 502 });
  const payments = [...result.value].sort((a, b) => b.line.createdAt.localeCompare(a.line.createdAt) || a.line.id.localeCompare(b.line.id));
  const received = payments.filter((p) => p.line.status === "completado");
  const currency = payments[0]?.milestone.currency ?? "COP";
  const scale = payments[0]?.milestone.scale ?? 0;
  const total = received.reduce((sum, p) => sum + amountOf(p), 0);
  return { name: session.name, payments, receivedCount: received.length, total: formatAmount(total, currency, scale) };
}

// What the supplier got: the received amount of the receipt once paid, the agreed amount before that (percent lines show their share).
function amountOf(p: SupplierPayment): number {
  return p.line.receipt?.received ?? (p.line.amountMode === "fixed" ? p.line.value : 0);
}

function amountText(p: SupplierPayment): string {
  if (p.line.status !== "completado" && p.line.amountMode === "percent") return `${p.line.value / 100} % del tope del hito`;
  return formatAmount(amountOf(p), p.milestone.currency, p.milestone.scale);
}

export default function SupplierPayments({ loaderData }: Route.ComponentProps) {
  const { name, payments, receivedCount, total } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl text-primary">Mis cobros</h1>
        <p className="max-w-prose text-pretty text-muted-foreground">
          Los pagos que los inversores hacen a la billetera de {name}: concepto, hito, monto recibido y comprobante.
        </p>
      </header>

      {payments.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">
          Todavía no tienes cobros. Cuando un productor te asigne un pago en un hito, aparecerá aquí.
        </p>
      ) : (
        <>
          <p className="rounded-lg border bg-card p-4 text-sm">
            <span className="text-muted-foreground">Recibido hasta hoy ({receivedCount} {receivedCount === 1 ? "pago" : "pagos"}): </span>
            <strong className="tabular-nums text-primary">{total}</strong>
          </p>
          <ul aria-label="Cobros" className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
            {payments.map((p) => (
              <li key={p.line.id} className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {CONCEPT_LABELS[p.line.concept]}
                      {p.line.reference && <span className="text-muted-foreground"> · {p.line.reference}</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Hito {p.milestone.sequenceOrder}: {p.milestone.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.project.title} ({p.project.projectCode})
                    </p>
                  </div>
                  <LineStatusBadge status={p.line.status} />
                </div>
                <p className="text-2xl font-bold tabular-nums text-primary">{amountText(p)}</p>
                <dl className="flex flex-col gap-0.5 text-xs">
                  <div>
                    <dt className="inline text-muted-foreground">Momento de pago: </dt>
                    <dd className="inline">{MOMENT_LABELS[p.line.moment]}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">Comprobante: </dt>
                    <dd className="inline break-all">{p.line.receiptId ?? "Aún sin comprobante"}</dd>
                  </div>
                  {p.line.receipt && (
                    <>
                      <div>
                        <dt className="inline text-muted-foreground">Pago entrante: </dt>
                        <dd className="inline break-all">{p.line.receipt.incomingPaymentId}</dd>
                      </div>
                      <div>
                        <dt className="inline text-muted-foreground">Pago saliente: </dt>
                        <dd className="inline break-all">{p.line.receipt.outgoingPaymentId}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return (
    <>
      <h1 className="text-2xl text-primary">No pudimos cargar tus cobros</h1>
      <p className="mt-2 text-muted-foreground">Revisa tu conexión y vuelve a intentarlo.</p>
      <Link to="/supplier" reloadDocument className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </Link>
    </>
  );
}
