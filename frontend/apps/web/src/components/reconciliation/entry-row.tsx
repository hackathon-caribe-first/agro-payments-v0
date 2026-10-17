import { CheckCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { ReconciliationEntry } from "@agro/shared/modules/reconciliation/domain/reconciliation";
import { REVIEW_NOTE_MAX_LENGTH } from "@agro/shared/modules/reconciliation/schemas/review-note";
import { Button } from "@agro/shared/ui/button";
import { Label } from "@agro/shared/ui/label";
import { Textarea } from "@agro/shared/ui/textarea";
import { formatDateTime } from "~/components/presale/format";
import type { ReconcileActionData } from "~/reconciliation/action-data";
import { ReconciliationStatusBadge, statusHelp } from "./status";

const money = (value: number | null, currency: string) => (value === null ? "—" : formatMoney(value, currency));

function ReviewForm({ entry, onDone }: { entry: ReconciliationEntry; onDone: () => void }) {
  const fetcher = useFetcher<ReconcileActionData>();
  const id = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.fieldErrors.note?.[0] ?? fetcher.data.fieldErrors._form?.[0] : undefined;
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) onDone();
    else if (error) noteRef.current?.focus();
  }, [fetcher.data, error, onDone]);

  return (
    <fetcher.Form method="post" className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
      <input type="hidden" name="intent" value="review" />
      <input type="hidden" name="entryId" value={entry.id} />
      <Label htmlFor={`${id}-note`}>Nota de conciliación</Label>
      <Textarea
        ref={noteRef}
        id={`${id}-note`}
        name="note"
        rows={2}
        maxLength={REVIEW_NOTE_MAX_LENGTH}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder="Qué revisaste y qué concluiste"
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="compact" disabled={busy}>
          <CheckCheck aria-hidden="true" />
          Guardar conciliación
        </Button>
        <Button type="button" variant="ghost" size="compact" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </fetcher.Form>
  );
}

// One incoming payment matched against its receipt, with both payment ids, the amounts and the append-only review notes.
export function EntryRow({ entry }: { entry: ReconciliationEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col gap-2 border-t py-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold">{entry.concept}</p>
          <p className="text-sm text-muted-foreground">
            {entry.projectTitle} · <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
          </p>
        </div>
        <ReconciliationStatusBadge status={entry.status} />
      </div>
      <p className="text-sm text-muted-foreground">{statusHelp(entry.status)}</p>

      <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Debitado al pagador</dt>
          <dd className="font-semibold tabular-nums">{money(entry.sentAmount, entry.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Según el comprobante</dt>
          <dd className="font-semibold tabular-nums">{money(entry.receiptAmount, entry.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Recibido en la billetera</dt>
          <dd className="font-semibold tabular-nums">{money(entry.incomingAmount, entry.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Comisión</dt>
          <dd className="font-semibold tabular-nums">{money(entry.receiptAmount === null ? null : entry.fee, entry.currency)}</dd>
        </div>
      </dl>

      <dl className="flex flex-col gap-1 break-all text-xs text-muted-foreground">
        <div>
          <dt className="inline">Pago entrante: </dt>
          <dd className="inline">{entry.incomingPaymentId ?? "No encontrado"}</dd>
        </div>
        <div>
          <dt className="inline">Pago saliente: </dt>
          <dd className="inline">{entry.outgoingPaymentId ?? "Sin registro"}</dd>
        </div>
        <div>
          <dt className="inline">Comprobante: </dt>
          <dd className="inline">{entry.receiptId ?? "Sin comprobante"}</dd>
        </div>
      </dl>

      {entry.reviews.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Notas de conciliación">
          {entry.reviews.map((r) => (
            <li key={r.id} className="rounded-sm bg-secondary px-2 py-1">
              <span aria-hidden="true">✓ </span>
              <span className="font-semibold">Conciliado</span> por {r.actor} · <time dateTime={r.at}>{formatDateTime(r.at)}</time>: {r.note}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <ReviewForm entry={entry} onDone={() => setOpen(false)} />
      ) : (
        <Button type="button" variant="outline" size="compact" className="self-start" onClick={() => setOpen(true)}>
          <CheckCheck aria-hidden="true" />
          Conciliar
        </Button>
      )}
    </li>
  );
}
