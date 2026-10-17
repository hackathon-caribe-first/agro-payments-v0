// Inline stepper of one payment (ported from caribefirst PaymentSteps): each Open Payments stage with how long it took after
// the previous one. Status is dot + text weight + screen-reader text, never color alone.
import { cn } from "@agro/shared/lib/utils";
import { formatElapsed, type PaymentStage, type StageStatus } from "@agro/shared/modules/trace/domain/payment-stages";

const ITEM: Record<StageStatus, string> = {
  done: "text-foreground",
  current: "font-semibold text-primary",
  failed: "font-semibold text-destructive",
  skipped: "text-muted-foreground",
  pending: "text-muted-foreground",
};

const DOT: Record<StageStatus, string> = {
  done: "border-success bg-success",
  current: "border-primary bg-secondary motion-safe:animate-pulse",
  failed: "border-destructive bg-destructive",
  skipped: "border-dashed border-muted-foreground bg-card",
  pending: "border-muted-foreground/40 bg-card",
};

const SR_STATUS: Record<StageStatus, string> = {
  done: "listo",
  current: "en curso",
  failed: "falló",
  skipped: "sin registro",
  pending: "pendiente",
};

export function PaymentSteps({ stages, label = "Pasos del pago en Open Payments" }: { stages: readonly PaymentStage[]; label?: string }) {
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-y-1.5 text-sm">
      {stages.map((stage, i) => {
        const took = formatElapsed(stage.elapsedSeconds);
        const inPlay = stage.status === "current" || stage.status === "failed";
        return (
          <li key={stage.key} aria-current={inPlay ? "step" : undefined} className={cn("flex items-center gap-1.5", ITEM[stage.status])}>
            {i > 0 && (
              <span aria-hidden="true" className={cn("mx-1.5 h-0.5 w-4 rounded-full", stages[i - 1]!.status === "done" ? "bg-success" : "bg-border")} />
            )}
            <span aria-hidden="true" className={cn("size-2.5 flex-none rounded-full border-2", DOT[stage.status])} />
            {stage.label}
            {took && <span className="font-normal text-muted-foreground tabular-nums">{took}</span>}
            {stage.note && <span className="font-normal text-muted-foreground">· {stage.note}</span>}
            <span className="sr-only"> ({SR_STATUS[stage.status]})</span>
          </li>
        );
      })}
    </ol>
  );
}

// The conversion is done by the wallet: Surco only shows the rate that resulted (caribefirst FxRate).
export function FxRate({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-sm text-muted-foreground tabular-nums">Conversión: {text}. La hace la wallet, no Surco.</p>;
}
