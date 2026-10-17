import { isDeadlineExpired } from "@agro/shared/modules/milestones/domain/milestone-rules";
import { StatusBadge } from "@agro/shared/ui/status-badge";

const todayIso = (): string => new Date().toISOString().slice(0, 10);

// D-08: a warning, not an action. The grant of an overdue milestone is NOT revoked automatically; the investor can still revoke it by hand.
export function DeadlineBadge({ status, dueDate }: { status: string; dueDate?: string | null }) {
  if (!isDeadlineExpired({ status, dueDate }, todayIso())) return null;
  return <StatusBadge label="Plazo vencido" tone="warning" symbol="⚠" />;
}
