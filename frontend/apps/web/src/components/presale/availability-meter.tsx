import type { PresaleListing } from "@agro/shared/modules/presales/domain/presale";
import { availableQuantity } from "@agro/shared/modules/presales/domain/presale-rules";
import { Progress } from "@agro/shared/ui/progress";
import { formatQuantity } from "./format";

export function AvailabilityMeter({ listing }: { listing: PresaleListing }) {
  const available = availableQuantity(listing);
  const committedPercent =
    listing.expectedQuantity > 0 ? Math.min(100, Math.round((listing.committedQuantity / listing.expectedQuantity) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{available > 0 ? "Disponibilidad" : "Sin disponibilidad"}</span>
        <span className="tabular-nums text-muted-foreground">
          {available > 0
            ? `${formatQuantity(available, listing)} de ${formatQuantity(listing.expectedQuantity, listing)}`
            : `${formatQuantity(listing.expectedQuantity, listing)} comprometidos`}
        </span>
      </div>
      <Progress value={committedPercent} aria-label={`Comprometido: ${committedPercent} %`} />
      <span className="text-sm tabular-nums text-muted-foreground">{committedPercent} % comprometido</span>
    </div>
  );
}
