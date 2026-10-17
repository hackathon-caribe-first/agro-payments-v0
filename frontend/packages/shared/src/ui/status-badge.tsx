import { cn } from "@agro/shared/lib/utils";
import type { Tone } from "@agro/shared/modules/milestones/milestone-state";

const TONES: Record<Tone, string> = {
  neutral: "border bg-muted text-foreground",
  warning: "bg-warning text-warning-foreground",
  success: "bg-secondary text-primary",
  danger: "border border-destructive bg-card text-destructive",
};

// Status is always text + color + symbol, never color alone.
export function StatusBadge({ label, tone, symbol, className }: { label: string; tone: Tone; symbol: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm font-semibold", TONES[tone], className)}>
      <span aria-hidden="true">{symbol}</span>
      {label}
    </span>
  );
}
