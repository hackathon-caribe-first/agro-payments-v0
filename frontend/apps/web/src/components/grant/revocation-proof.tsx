import { ShieldCheck } from "lucide-react";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { MilestoneGrant } from "@agro/shared/modules/grants/domain/grant";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { formatDateTime } from "~/components/presale/format";
import { revocationReasonText } from "./status";

// The localized time ends in "p. m." / "a. m.": do not add a second period.
const endSentence = (text: string): string => (text.endsWith(".") ? text : `${text}.`);

// Closing proof of a revoked grant: cap, spent and what never left the wallet, plus the wallet's answer to the cancel.
export function RevocationProof({ grant }: { grant: MilestoneGrant }) {
  const proof = grant.revocation;
  if (!proof) return null;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="inline-flex items-center gap-1.5 text-base text-primary">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Comprobante de revocación
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 text-sm">
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5">
          <dt className="text-muted-foreground">Tope</dt>
          <dd className="text-right font-semibold tabular-nums">{formatMoney(proof.cap, grant.currency)}</dd>
          <dt className="text-muted-foreground">Gastado</dt>
          <dd className="text-right font-semibold tabular-nums">{formatMoney(proof.spent, grant.currency)}</dd>
          <dt className="text-muted-foreground">Sigue en tu billetera</dt>
          <dd className="text-right font-semibold tabular-nums text-primary">{formatMoney(proof.remainingInWallet, grant.currency)}</dd>
          <dt className="text-muted-foreground">Respuesta de la billetera</dt>
          <dd className="text-right font-semibold tabular-nums">{proof.deleteResponseStatus}</dd>
        </dl>
        <p className="text-pretty text-muted-foreground">
          {grant.revocationReason ? `${revocationReasonText(grant.revocationReason)}. ` : ""}
          {grant.revokedAt ? `${endSentence(`Revocado el ${formatDateTime(grant.revokedAt)}`)} ` : ""}
          Los tokens guardados se borraron y cualquier pago posterior se rechaza.
        </p>
      </CardContent>
    </Card>
  );
}
