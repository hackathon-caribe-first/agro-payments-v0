import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@agro/shared/ui/alert-dialog";
import { Checkbox } from "@agro/shared/ui/checkbox";
import { Label } from "@agro/shared/ui/label";

// "Mostrar tokens completos" is OFF by default (RNF-02). Turning it on needs a confirmation; turning it off is immediate.
// The choice lives only in this component's state: it is never written to storage or the URL.
export function RevealToggle({ revealed, onChange }: { revealed: boolean; onChange: (next: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id="reveal-tokens"
        checked={revealed}
        onCheckedChange={(checked) => {
          if (checked === true) setAsking(true);
          else onChange(false);
        }}
      />
      <Label htmlFor="reveal-tokens">Mostrar tokens completos</Label>

      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Mostrar los tokens completos?</AlertDialogTitle>
            <AlertDialogDescription>
              Un token completo permite actuar sobre la billetera mientras siga vigente. Muéstralo solo si soporte lo necesita y que nadie más vea tu pantalla. No se guarda: al
              salir de esta página vuelve a quedar recortado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onChange(true);
                setAsking(false);
              }}
            >
              Mostrar tokens
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
