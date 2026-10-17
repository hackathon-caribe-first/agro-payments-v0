import { cn } from "@agro/shared/lib/utils";
import type { MilestoneGrant } from "@agro/shared/modules/grants/domain/grant";

type StepState = "done" | "current" | "todo" | "failed";

const SYMBOLS: Record<StepState, string> = { done: "✓", current: "◷", todo: "○", failed: "✕" };
const SR: Record<StepState, string> = { done: "completado", current: "en curso", todo: "pendiente", failed: "con problemas" };

function stepStates(grant: MilestoneGrant, verifying: boolean): StepState[] {
  if (grant.status === "ACTIVE" || grant.status === "REVOKED") return ["done", "done", "done", "done"];
  if (grant.status === "DENIED") return ["done", "failed", "todo", "todo"];
  if (grant.hashState === "MISMATCH") return ["done", "done", "failed", "todo"];
  if (verifying) return ["done", "done", "current", "todo"];
  return ["done", "current", "todo", "todo"];
}

const LABELS = ["Grant solicitado", "Aprobación en la billetera", "Verificando aprobación", "Grant activo"];

// The consent flow as steps. "Verificando aprobación" is the hash check plus grant.continue that follows the wallet answer.
export function ApprovalSteps({ grant, verifying = false }: { grant: MilestoneGrant; verifying?: boolean }) {
  const states = stepStates(grant, verifying);
  return (
    <ol aria-label="Pasos de la aprobación" className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
      {LABELS.map((label, i) => (
        <li
          key={label}
          aria-current={states[i] === "current" ? "step" : undefined}
          className={cn("inline-flex items-center gap-1.5", states[i] === "todo" && "text-muted-foreground", states[i] === "failed" && "text-destructive")}
        >
          <span aria-hidden="true" className="font-semibold">
            {SYMBOLS[states[i]]}
          </span>
          <span className={cn(states[i] === "current" && "font-semibold")}>{label}</span>
          <span className="sr-only">({SR[states[i]]})</span>
        </li>
      ))}
    </ol>
  );
}
