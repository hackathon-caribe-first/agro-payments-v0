import { Trash2 } from "lucide-react";
import { useFetcher } from "react-router";
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

// Removing a line changes the split the investor sees, so it asks first.
export function RemoveLineDialog({ lineId, label }: { lineId: string; label: string }) {
  const fetcher = useFetcher();
  const pending = fetcher.state !== "idle";
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="icon-compact" aria-label={`Quitar la línea de ${label}`} disabled={pending}>
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar esta línea?</AlertDialogTitle>
          <AlertDialogDescription>
            Se quita la línea de {label} del reparto del hito. Aún no se ha pedido ningún pago, así que no se mueve dinero.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="compact">Conservar</AlertDialogCancel>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="remove" />
            <input type="hidden" name="lineId" value={lineId} />
            <AlertDialogAction type="submit" variant="destructive" size="compact">
              Quitar línea
            </AlertDialogAction>
          </fetcher.Form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
