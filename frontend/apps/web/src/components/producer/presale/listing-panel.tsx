import { Lock } from "lucide-react";
import { Form, useNavigation } from "react-router";
import type { PresaleListing } from "@agro/shared/modules/presales/domain/presale";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@agro/shared/ui/alert-dialog";
import { Button } from "@agro/shared/ui/button";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { AvailabilityMeter } from "~/components/presale/availability-meter";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { formatDay, formatQuantity } from "~/components/presale/format";
import { ListingStatusBadge } from "~/components/presale/status-badges";

export function ListingPanel({ listing, actionData }: { listing: PresaleListing; actionData?: PresaleActionData }) {
  const pending = useNavigation().state !== "idle";
  const error = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base text-primary">{listing.title}</h3>
          <p className="text-pretty text-sm text-muted-foreground">{listing.summary}</p>
        </div>
        <ListingStatusBadge status={listing.status} />
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Cantidad esperada</dt>
          <dd className="font-semibold tabular-nums">{formatQuantity(listing.expectedQuantity, listing)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Precio de referencia</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(listing.referenceUnitPrice, listing.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cosecha estimada</dt>
          <dd className="font-semibold">{formatDay(listing.estimatedHarvestDate)}</dd>
        </div>
      </dl>
      <AvailabilityMeter listing={listing} />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Form method="post" id="close-listing-form">
        <input type="hidden" name="intent" value="close" />
        <input type="hidden" name="listingId" value={listing.id} />
      </Form>
      {/* Closing cannot be undone, so it asks first. The dialog is portaled, hence the submit button targets the form by id. */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline" size="compact" disabled={pending} className="self-start">
            <Lock aria-hidden="true" />
            {pending ? "Cerrando…" : "Cerrar preventa"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar esta preventa?</AlertDialogTitle>
            <AlertDialogDescription>
              Ya no recibirá nuevas solicitudes ni cotizaciones. Las cotizaciones de venta vigentes podrán seguir aceptándose. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="compact">Cancelar</AlertDialogCancel>
            <AlertDialogAction size="compact" type="submit" form="close-listing-form">
              Cerrar preventa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
