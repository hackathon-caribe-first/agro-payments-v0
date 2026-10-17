import { ArrowRight, FileText } from "lucide-react";
import { Link } from "react-router";
import type { ListingEntry } from "@agro/shared/modules/presales/application/use-cases";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { availableQuantity, canRequest } from "@agro/shared/modules/presales/domain/presale-rules";
import { AvailabilityMeter } from "~/components/presale/availability-meter";
import { formatDay, formatQuantity, unitText } from "~/components/presale/format";

export function ListingCard({ entry }: { entry: ListingEntry }) {
  const { listing, projectTitle } = entry;
  const requestable = canRequest(listing);
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
          <div className="flex flex-wrap items-center gap-2">
            {requestable ? (
              <Button asChild size="compact">
                <Link to={`/buyer/projects/${listing.id}#request-form`}>
                  <FileText aria-hidden="true" />
                  Solicitar cotización
                </Link>
              </Button>
            ) : (
              <Button type="button" size="compact" disabled aria-describedby={`no-request-${listing.id}`}>
                <FileText aria-hidden="true" />
                Solicitar cotización
              </Button>
            )}
            <Button asChild variant="outline" size="compact">
              <Link to={`/buyer/projects/${listing.id}`}>
                Ver proyecto
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          {!requestable && (
            <p id={`no-request-${listing.id}`} className="text-sm text-muted-foreground">
              {availableQuantity(listing) <= 0 ? "Sin disponibilidad: ya no se pueden solicitar cotizaciones." : "Este proyecto ya no recibe solicitudes."}
            </p>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
