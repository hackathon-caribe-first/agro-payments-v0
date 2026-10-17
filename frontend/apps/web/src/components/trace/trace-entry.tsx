import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toCurl, type TraceEntry } from "@agro/shared/modules/trace/domain/trace";
import { Button } from "@agro/shared/ui/button";
import { formatDateTime } from "~/components/presale/format";

// One Open Payments request as a curl command. What is copied is exactly what is shown: trimmed tokens unless revealed.
export function TraceEntryCard({ entry, revealTokens }: { entry: TraceEntry; revealTokens: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const curl = toCurl(entry, revealTokens);

  async function copy() {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold">{entry.subject}</p>
          <p className="text-sm text-muted-foreground">
            {entry.projectTitle} · {entry.milestoneTitle} · <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
          </p>
        </div>
        <Button type="button" variant="outline" size="compact" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copiado" : "Copiar comando"}
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? "Comando copiado al portapapeles" : ""}
          </span>
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-sm bg-muted p-3 text-xs leading-relaxed">
        <code>{curl}</code>
      </pre>
      <p className="text-sm text-muted-foreground">Respuesta esperada: {entry.expect}</p>
    </li>
  );
}
