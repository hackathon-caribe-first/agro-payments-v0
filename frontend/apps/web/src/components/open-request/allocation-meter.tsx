import type { OpenRequest } from "@agro/shared/modules/presales/domain/presale";
import { Progress } from "@agro/shared/ui/progress";
import { formatQuantity } from "~/components/presale/format";

// How much of the requested quantity is already agreed. Announced politely because it changes after each agreement.
export function AllocationMeter({ openRequest, remaining }: { openRequest: OpenRequest; remaining: number }) {
  const percent = openRequest.quantity > 0 ? Math.min(100, Math.round((openRequest.awardedQuantity / openRequest.quantity) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">Asignación</span>
        <span aria-live="polite" className="tabular-nums text-muted-foreground">
          Acordado {formatQuantity(openRequest.awardedQuantity, openRequest)} de {formatQuantity(openRequest.quantity, openRequest)} · Pendiente{" "}
          {formatQuantity(remaining, openRequest)}
        </span>
      </div>
      <Progress value={percent} aria-label={`Acordado: ${percent} %`} />
    </div>
  );
}
