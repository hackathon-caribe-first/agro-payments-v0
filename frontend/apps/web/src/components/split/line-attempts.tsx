import { MAX_PAYMENT_ATTEMPTS, type PaymentLine } from "@agro/shared/modules/payment-lines/domain/line";
import { formatDateTime } from "~/components/presale/format";
import { LINE_EVENT_LABELS } from "./copy";

// RF-11: where a queued or failed line stands: the attempt counter, when the engine tries again and the history of the line.
export function LineAttempts({ line }: { line: PaymentLine }) {
  const attempts = line.attempts ?? 0;
  const history = line.history ?? [];
  if (attempts === 0 && history.length === 0) return null;
  return (
    <div className="mt-1 flex max-w-64 flex-col gap-1 text-xs">
      {line.status === "en_cola" && (
        <p className="text-muted-foreground">
          Intento {attempts} de {MAX_PAYMENT_ATTEMPTS}.
          {line.nextAttemptAt ? (
            <>
              {" "}
              Próximo intento: <time dateTime={line.nextAttemptAt}>{formatDateTime(line.nextAttemptAt)}</time>.
            </>
          ) : null}
        </p>
      )}
      {line.status === "fallido" && attempts > 0 && (
        <p className="text-muted-foreground">
          {attempts} {attempts === 1 ? "intento" : "intentos"} sin éxito.
        </p>
      )}
      {history.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold text-primary underline underline-offset-4">Historial de la línea ({history.length})</summary>
          <ol className="mt-1 flex flex-col gap-1.5 border-l pl-2">
            {history.map((entry, i) => (
              <li key={`${entry.at}-${i}`}>
                <span className="font-semibold">{LINE_EVENT_LABELS[entry.type]}</span> · <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                <span className="block text-muted-foreground" title={entry.code ?? undefined}>{entry.message}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
