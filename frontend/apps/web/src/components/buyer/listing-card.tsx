import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { ListingEntry } from "@agro/shared/modules/presales/application/use-cases";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { AvailabilityMeter } from "~/components/presale/availability-meter";
import { formatDay, formatQuantity, unitText } from "~/components/presale/format";

export function ListingCard({ entry }: { entry: ListingEntry }) {
  const { listing, projectTitle } = entry;
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            {productionTypeLabel(listing.productionType)}
            {projectTitle ? ` · ${projectTitle}` : ""}
          </p>
          <CardTitle className="break-words text-lg text-primary">{listing.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Cantidad esperada</dt>
              <dd className="font-semibold tabular-nums">{formatQuantity(listing.expectedQuantity, listing)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Precio de referencia</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(listing.referenceUnitPrice, listing.currency)} / {unitText(listing, 1)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Cosecha estimada</dt>
              <dd className="font-semibold">{formatDay(listing.estimatedHarvestDate)}</dd>
            </div>
          </dl>
          <AvailabilityMeter listing={listing} />
          <Button asChild variant="outline" size="compact" className="self-start">
            <Link to={`/comprador/preventas/${listing.id}`}>
              Ver preventa
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
