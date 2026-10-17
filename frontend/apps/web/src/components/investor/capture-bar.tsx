import type { Capture } from "@agro/shared/modules/investments/domain/investment";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Progress } from "@agro/shared/ui/progress";

// The capture bar (RF-10): COP that reached custody against the target, and how much came in each investor currency.
export function CaptureBar({ capture, detailed = false }: { capture: Capture; detailed?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold tabular-nums">
          {formatMoney(capture.raised, capture.currency)} de {formatMoney(capture.targetAmount, capture.currency)}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {capture.progressPct} % · {capture.investorsCount} {capture.investorsCount === 1 ? "inversionista" : "inversionistas"}
        </span>
      </div>
      <Progress value={capture.progressPct} aria-label={`Captación: ${capture.progressPct} %`} />
      {detailed && capture.byCurrency.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {capture.byCurrency.map((c) => (
            <li key={c.currency} className="tabular-nums">
              {c.currency}: {formatMoney(Number(c.debited), c.currency, 2)} debitados → {formatMoney(c.receivedCop, capture.currency)} recibidos
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SimulationNotice() {
  return <p className="text-sm text-muted-foreground">Entorno de simulación · Sin dinero real</p>;
}
