import { KeyRound, Wallet } from "lucide-react";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { MilestoneGrant } from "@agro/shared/modules/grants/domain/grant";
import { remainingCap } from "@agro/shared/modules/grants/domain/grant-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { GrantProgress } from "./grant-progress";
import { HashStateBadge } from "./status";

// Aside card: cap, spent and remaining, the investor wallet and the trimmed token (the real one is never shown).
export function GrantSummary({ grant }: { grant: MilestoneGrant }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base text-primary">Tope del hito</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4">
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Tope</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(grant.capAmount, grant.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Gastado</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(grant.spent, grant.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{grant.status === "REVOKED" ? "Sigue en tu billetera" : "Disponible"}</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(remainingCap(grant), grant.currency)}</dd>
          </div>
        </dl>
        <GrantProgress grant={grant} label="Gastado del tope del grant" />
        <p className="text-pretty text-xs text-muted-foreground">
          El tope incluye el margen de comisiones y vale para toda la vida del grant. Lo que no se gaste nunca sale de tu billetera.
        </p>
        <dl className="flex flex-col gap-3 border-t pt-3 text-sm">
          <div>
            <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Wallet aria-hidden="true" className="size-4" />
              Billetera del inversor
            </dt>
            <dd className="break-all font-semibold">{grant.wallet}</dd>
          </div>
          <div>
            <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
              <KeyRound aria-hidden="true" className="size-4" />
              Token de acceso
            </dt>
            <dd className="break-all font-mono text-sm font-semibold">{grant.tokenMasked ?? "Sin token guardado"}</dd>
          </div>
          <div>
            <dt className="mb-1 text-muted-foreground">Verificación de la aprobación</dt>
            <dd>
              <HashStateBadge state={grant.hashState} />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
