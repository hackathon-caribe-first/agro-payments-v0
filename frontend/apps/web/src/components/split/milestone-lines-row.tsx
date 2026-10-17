import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { ProjectLinesRow } from "@agro/shared/modules/payment-lines/application/use-cases";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { money } from "./copy";

// One milestone in the project summary: its cap, how many lines are planned and what they add up to.
export function MilestoneLinesRow({ row }: { row: ProjectLinesRow }) {
  const { milestone, preview, ctx, lineCount } = row;
  const over = preview.overBy > 0;
  return (
    <li>
      <Card className="h-full">
        <CardHeader>
          <p className="text-sm text-muted-foreground">Hito {milestone.sequenceOrder}</p>
          <CardTitle className="text-lg text-primary">{milestone.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Tope del hito</dt>
              <dd className="font-semibold tabular-nums">{money(ctx, milestone.cap)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Líneas previstas</dt>
              <dd className="font-semibold tabular-nums">{lineCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Σ Recibe</dt>
              <dd className="font-semibold tabular-nums">{money(ctx, preview.sumReceive)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total debitado</dt>
              <dd className={`font-semibold tabular-nums ${over ? "text-destructive" : ""}`}>
                {over ? "✕ " : ""}
                {money(ctx, preview.totalDebit)}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            {over ? `Supera el tope por ${money(ctx, preview.overBy)}.` : `Sobrante en la billetera del inversor: ${money(ctx, preview.unspent)}.`}
          </p>
          <Button asChild variant="outline" size="compact" className="self-start">
            <Link to={`/producer/milestones/${milestone.id}/lines`}>
              Ver líneas de pago
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
