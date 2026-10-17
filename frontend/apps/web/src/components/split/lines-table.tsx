import { Pencil } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { canRetryPayment, idempotencyKey, isEditable, type PaymentLine } from "@agro/shared/modules/payment-lines/domain/line";
import type { SplitContext, SplitPreview } from "@agro/shared/modules/payment-lines/domain/split";
import { BENEFICIARY_ROLE_LABELS, CONCEPT_LABELS, MOMENT_LABELS, lineAmountText, money, shortWallet } from "./copy";
import { LineAttempts } from "./line-attempts";
import { LineStatusBadge } from "./line-status-badge";
import { RemoveLineDialog } from "./remove-line-dialog";
import { RetryPaymentButton } from "./retry-payment-button";

interface Props {
  ctx: SplitContext;
  lines: PaymentLine[];
  preview: SplitPreview;
  // Base path for the "edit" links; omit for a read-only table.
  editPath?: string;
}

// RF-10 / RF-15: what the paid line looks like on the wallets (both payment ids and the amounts).
function LineReceiptDetail({ ctx, line }: { ctx: SplitContext; line: PaymentLine }) {
  const receipt = line.receipt;
  return (
    <dl className="mt-1 flex max-w-64 flex-col gap-0.5 text-xs">
      {line.receiptId && (
        <div>
          <dt className="inline text-muted-foreground">Comprobante: </dt>
          <dd className="inline break-all">{line.receiptId}</dd>
        </div>
      )}
      {receipt && (
        <>
          <div>
            <dt className="inline text-muted-foreground">Pago saliente: </dt>
            <dd className="inline break-all">{receipt.outgoingPaymentId}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Pago entrante: </dt>
            <dd className="inline break-all">{receipt.incomingPaymentId}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Debitado / recibido / comisión: </dt>
            <dd className="inline tabular-nums">
              {money(ctx, receipt.debited)} / {money(ctx, receipt.received)} / {money(ctx, receipt.fee)}
            </dd>
          </div>
        </>
      )}
    </dl>
  );
}

function lineTitle(line: PaymentLine) {
  if (line.concept === "imprevisto") return `${CONCEPT_LABELS.imprevisto}${line.reference ? ` · ${line.reference}` : ""}`;
  return `${CONCEPT_LABELS[line.concept]}${line.reference ? ` ${line.reference}` : ""}`;
}

// The planned lines of one milestone with what each one receives, the estimated commission and what it debits.
export function LinesTable({ ctx, lines, preview, editPath }: Props) {
  if (lines.length === 0) {
    return <p className="rounded-lg border bg-card p-5 text-muted-foreground">Este hito aún no tiene líneas de pago. Agrega la primera con el formulario.</p>;
  }
  const byId = new Map(lines.map((l) => [l.id, l]));
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        <caption className="sr-only">Líneas de pago del hito</caption>
        <thead className="border-b bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Beneficiario</th>
            <th scope="col" className="px-3 py-2 font-semibold">Concepto</th>
            <th scope="col" className="px-3 py-2 font-semibold">Momento</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Monto</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Recibe</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Comisión estimada</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Debita al inversor</th>
            <th scope="col" className="px-3 py-2 font-semibold">Estado</th>
            {editPath && (
              <th scope="col" className="px-3 py-2 font-semibold">
                <span className="sr-only">Acciones</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const row = preview.byLine[line.id];
            const anchor = row?.consolidatedInto ? byId.get(row.consolidatedInto) : undefined;
            const deferred = row?.paidAt && row.paidAt !== line.moment ? row.paidAt : null;
            return (
              <tr key={line.id} className="border-b align-top last:border-b-0">
                <td className="px-3 py-3">
                  <p className="font-semibold">{line.beneficiary.name}</p>
                  <p className="text-muted-foreground">{BENEFICIARY_ROLE_LABELS[line.beneficiary.role]}</p>
                  <p className="break-all text-xs text-muted-foreground">{shortWallet(line.beneficiary.walletAddress)}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-semibold">{lineTitle(line)}</p>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Detalle técnico</summary>
                    <p>
                      Clave de idempotencia: <code className="break-all">{idempotencyKey(ctx.milestoneId, line.id)}</code>
                    </p>
                  </details>
                  {anchor && <p className="mt-1 text-xs text-muted-foreground">Se paga junto con {lineTitle(anchor)} (una sola comisión).</p>}
                  {deferred && <p className="mt-1 text-xs text-muted-foreground">Se paga en el momento «{MOMENT_LABELS[deferred]}».</p>}
                </td>
                <td className="px-3 py-3">{MOMENT_LABELS[line.moment]}</td>
                <td className="px-3 py-3 text-right tabular-nums">{lineAmountText(ctx, line)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(ctx, row?.receive ?? 0)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(ctx, row?.commission ?? 0)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(ctx, row?.debit ?? 0)}</td>
                <td className="px-3 py-3">
                  <LineStatusBadge status={line.status} />
                  {line.status === "pendiente" && (
                    <p className="mt-1 max-w-48 text-xs text-muted-foreground">
                      {line.moment === "insumos" ? "Se pagará cuando el grant del hito esté activo." : "Se pagará cuando el hito tenga dictamen aprobado."}
                    </p>
                  )}
                  {line.status === "completado" && <LineReceiptDetail ctx={ctx} line={line} />}
                  {line.status !== "completado" && <LineAttempts line={line} />}
                </td>
                {editPath && (
                  <td className="px-3 py-3">
                    {isEditable(line) ? (
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="icon-compact">
                          <Link to={`${editPath}?edit=${line.id}`} aria-label={`Editar la línea de ${line.beneficiary.name}`}>
                            <Pencil aria-hidden="true" />
                          </Link>
                        </Button>
                        <RemoveLineDialog lineId={line.id} label={line.beneficiary.name} />
                      </div>
                    ) : canRetryPayment(line) ? (
                      <RetryPaymentButton lineId={line.id} label={line.beneficiary.name} />
                    ) : line.concept === "comision" && line.status === "pendiente" ? (
                      <p className="max-w-40 text-xs text-muted-foreground">La planea el sistema: no se edita.</p>
                    ) : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t bg-muted font-semibold">
          <tr>
            <th scope="row" colSpan={4} className="px-3 py-2 text-left">
              Total
            </th>
            <td className="px-3 py-2 text-right tabular-nums">{money(ctx, preview.sumReceive)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(ctx, preview.sumCommission)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(ctx, preview.totalDebit)}</td>
            <td colSpan={editPath ? 2 : 1} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
