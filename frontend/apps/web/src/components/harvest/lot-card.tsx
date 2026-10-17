import { ArrowRight } from "lucide-react";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Link } from "react-router";
import { formatKg, metricLabel, type HarvestBatch } from "@agro/shared/modules/harvest/domain/harvest";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";

export function LotCard({ lot }: { lot: HarvestBatch }) {
  const metrics = Object.entries(lot.certifiedMetrics ?? lot.qualityMetrics);
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            {productionTypeLabel(lot.productionType)} · {lot.producerName}
          </p>
          <CardTitle className="break-words text-lg text-primary">{lot.projectTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Disponible</dt>
              <dd className="font-semibold tabular-nums">{formatKg(lot.availableKg)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Precio por kilo</dt>
              <dd className="font-semibold tabular-nums">{formatMoney(lot.askingPricePerKg, lot.currency)}</dd>
            </div>
            {metrics.slice(0, 3).map(([key, value]) => (
              <div key={key}>
                <dt className="text-muted-foreground">{metricLabel(key)}</dt>
                <dd className="tabular-nums">{String(value)}</dd>
              </div>
            ))}
          </dl>
          <Button asChild size="compact" className="self-start">
            <Link to={`/buyer/marketplace/${lot.id}`}>
              Ver lote
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
