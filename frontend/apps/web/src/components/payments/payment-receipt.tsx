// Receipt card of one payment (ported from caribefirst Receipt): what it is, how much, who paid, where it stands, its stages and
// the Open Payments proof. Every step URL stays one click away in "Pasos registrados".
import { useEffect, useRef, useState } from "react";
import { paymentKindLabel, paymentStepLabel, shortenUrl, type PaymentTimeline } from "@agro/shared/modules/trace/domain/payment-steps";
import {
  formatPaymentMoney,
  fxRateText,
  paymentPayer,
  shortResourceId,
  toPaymentReceipt,
  type PaymentState,
} from "@agro/shared/modules/trace/domain/payment-stages";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import { formatDateTime } from "~/components/presale/format";
import { FxRate, PaymentSteps } from "~/components/payments/payment-steps";

// Never a green check before the wallet confirmed the payment (Surco money states).
const STATE_BADGE: Record<PaymentState, { label: string; tone: Tone; symbol: string }> = {
  confirmed: { label: "Confirmado en la wallet", tone: "success", symbol: "✓" },
  failed: { label: "No se pudo pagar", tone: "danger", symbol: "✕" },
  unconfirmed: { label: "Enviado, falta confirmarlo en la wallet", tone: "warning", symbol: "!" },
  sent: { label: "Pago enviado, esperando confirmación", tone: "warning", symbol: "…" },
  in_progress: { label: "En camino", tone: "warning", symbol: "…" },
};

const timeFormat = new Intl.DateTimeFormat("es-CO", { timeStyle: "medium" });
const dayFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

// Today's payments read as a clock time, like caribefirst; older ones keep their day.
const whenText = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameDay = dayFormat.format(date) === dayFormat.format(new Date());
  return sameDay ? timeFormat.format(date) : `${dayFormat.format(date)}, ${timeFormat.format(date)}`;
};

function CopyButton({ url, label, srLabel }: { url: string; label: string; srLabel: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <Button type="button" variant="link" size="compact" className="px-1" onClick={() => void copy()}>
        {copied ? "Copiado" : label}
        <span className="sr-only"> {srLabel}</span>
      </Button>
      <span className="sr-only" role="status">
        {copied ? "Enlace copiado al portapapeles" : ""}
      </span>
    </>
  );
}

function RecordedSteps({ payment }: { payment: PaymentTimeline }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-primary">Pasos registrados ({payment.steps.length})</summary>
      <p className="mt-2 break-all text-muted-foreground">
        Id del pago: <code className="font-mono">{payment.paymentId}</code>
      </p>
      <ol className="mt-2 flex flex-col gap-2 border-l-2 border-border pl-4">
        {payment.steps.map((s, i) => (
          <li key={`${s.step}-${s.at}-${i}`} className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{paymentStepLabel(s.step)}</span>
              <time dateTime={s.at} className="text-muted-foreground tabular-nums">
                {formatDateTime(s.at)}
              </time>
            </div>
            {s.opUrl && (
              <div className="flex flex-wrap items-center gap-1">
                <code title={s.opUrl} className="min-w-0 break-all font-mono text-sm">
                  {shortenUrl(s.opUrl)}
                </code>
                <CopyButton url={s.opUrl} label="Copiar URL" srLabel={`de ${paymentStepLabel(s.step)}`} />
              </div>
            )}
            {s.detail && <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm whitespace-pre-wrap break-all">{JSON.stringify(s.detail, null, 2)}</pre>}
          </li>
        ))}
      </ol>
    </details>
  );
}

// `projectLabel` is the project title when known; the card falls back to the raw project id.
export function PaymentReceipt({ payment, projectLabel }: { payment: PaymentTimeline; projectLabel?: string }) {
  const receipt = toPaymentReceipt(payment);
  const badge = STATE_BADGE[receipt.state];
  const kind = paymentKindLabel(payment.kind);
  const amount = receipt.amounts.receive ?? receipt.amounts.debit;
  const payer = paymentPayer(payment.kind);
  const subtitle = [whenText(receipt.updatedAt), payment.projectId ? `Proyecto ${projectLabel ?? payment.projectId}` : null].filter(Boolean).join(" · ");

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 transition-shadow duration-150 hover:shadow-sm sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-brand font-bold text-primary">{kind}</p>
          <p className="text-sm text-muted-foreground tabular-nums">
            <time dateTime={receipt.updatedAt}>{subtitle}</time>
          </p>
          {payer && <p className="text-sm font-semibold">Pagó: {payer}</p>}
        </div>
        {amount && <p className="font-brand text-2xl font-black tracking-tight text-primary tabular-nums">{formatPaymentMoney(amount)}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={badge.label} tone={badge.tone} symbol={badge.symbol} className="rounded-full px-3" />
        {receipt.error && <p className="text-sm font-semibold text-destructive">{receipt.error}</p>}
      </div>

      <PaymentSteps stages={receipt.stages} label={`Pasos de ${kind} en Open Payments`} />
      <FxRate text={fxRateText(receipt.amounts)} />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-dashed pt-3 text-sm">
        {receipt.proofUrl ? (
          <>
            <span className="text-muted-foreground">Comprobante Open Payments:</span>
            <code title={receipt.proofUrl} className="rounded-sm bg-muted px-2 py-0.5 font-mono text-sm">
              {shortResourceId(receipt.proofUrl)}
            </code>
            <CopyButton url={receipt.proofUrl} label="Copiar" srLabel="el enlace completo del outgoing payment" />
          </>
        ) : (
          <span className="text-muted-foreground">Aún sin comprobante: el pago no tiene outgoing payment.</span>
        )}
      </div>

      <RecordedSteps payment={payment} />
    </li>
  );
}
