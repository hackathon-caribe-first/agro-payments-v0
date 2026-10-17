import { RotateCw } from "lucide-react";
import { useFetcher } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { Button } from "@agro/shared/ui/button";
import type { SplitActionData } from "./copy";

// RF-11 "Reintentar pago": asks the platform to pay a queued or failed line again. Idempotent by `milestone:line`, so pressing it twice never
// creates a second payment. The answer is announced politely next to the button.
export function RetryPaymentButton({ lineId, label }: { lineId: string; label: string }) {
  const fetcher = useFetcher<SplitActionData>();
  const pending = fetcher.state !== "idle";
  const message = fetcher.data?.fieldErrors?.[FORM_LEVEL_KEY]?.join(" ");
  return (
    <fetcher.Form method="post" className="flex flex-col items-start gap-1">
      <input type="hidden" name="intent" value="retry" />
      <input type="hidden" name="lineId" value={lineId} />
      <Button type="submit" variant="outline" size="compact" disabled={pending} aria-label={`Reintentar el pago de ${label}`}>
        <RotateCw aria-hidden="true" />
        {pending ? "Reintentando…" : "Reintentar pago"}
      </Button>
      <p aria-live="polite" className="max-w-48 text-xs text-destructive">
        {message}
      </p>
    </fetcher.Form>
  );
}
