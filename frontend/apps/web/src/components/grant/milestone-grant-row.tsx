import { ArrowRight, HandCoins } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import type { GrantMilestoneRef } from "@agro/shared/modules/grants/domain/grant";
import type { MilestoneGrantState } from "@agro/shared/modules/grants/domain/grant-rules";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import { DeadlineBadge } from "~/components/deadline-badge";
import { GrantProgress } from "./grant-progress";
import { GrantStatusBadge } from "./status";

// One milestone of a project with the state of its grant. Only the next eligible milestone offers "Solicitar grant del hito".
export function MilestoneGrantRow({
  milestone,
  currency,
  state,
  fieldError,
}: {
  milestone: GrantMilestoneRef;
  currency: string;
  state: MilestoneGrantState;
  fieldError?: string;
}) {
  const pending = useNavigation().state !== "idle";
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Hito {milestone.sequenceOrder}</p>
              <CardTitle className="break-words text-lg text-primary">{milestone.title}</CardTitle>
            </div>
            {state.kind === "live" || state.kind === "revoked" ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <GrantStatusBadge status={state.grant.status} />
                {state.kind === "live" && <DeadlineBadge status={milestone.status} dueDate={milestone.estimatedCompletionDate} />}
              </div>
            ) : state.kind === "closed" ? (
              <StatusBadge label="Hito cerrado" tone="neutral" symbol="○" />
            ) : state.kind === "blocked" ? (
              <StatusBadge label="En espera" tone="neutral" symbol="○" />
            ) : (
              <StatusBadge label="Sin grant" tone="neutral" symbol="○" />
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Tope del grant <span className="font-semibold tabular-nums text-foreground">{formatMoney(milestone.budget, currency)}</span>
          </p>
          {(state.kind === "live" || state.kind === "revoked") && <GrantProgress grant={state.grant} label={`Gastado del tope del hito ${milestone.sequenceOrder}`} />}
          {state.kind === "live" && (
            <Button asChild variant={state.grant.status === "PENDING_APPROVAL" ? "default" : "outline"} size="compact" className="self-start">
              <Link to={state.grant.status === "PENDING_APPROVAL" ? `/investor/grants/${state.grant.id}/approve` : `/investor/grants/${state.grant.id}`}>
                {state.grant.status === "PENDING_APPROVAL" ? "Revisar y aprobar" : "Ver detalle"}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
          {state.kind === "revoked" && (
            <Button asChild variant="outline" size="compact" className="self-start">
              <Link to={`/investor/grants/${state.grant.id}`}>
                Ver comprobante
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
          {state.kind === "blocked" && (
            <p className="text-sm text-muted-foreground">
              Se podrá solicitar cuando se revoque el grant del hito {state.previous.sequenceOrder}.
            </p>
          )}
          {state.kind === "closed" && <p className="text-sm text-muted-foreground">Este hito ya no necesita la aprobación del grant.</p>}
          {state.kind === "eligible" && (
            <Form method="post" className="flex flex-col gap-2">
              <input type="hidden" name="intent" value="request" />
              <input type="hidden" name="milestoneId" value={milestone.id} />
              {fieldError && (
                <p role="alert" className="text-sm text-destructive">
                  {fieldError}
                </p>
              )}
              <Button type="submit" size="compact" disabled={pending} className="self-start">
                <HandCoins aria-hidden="true" />
                Solicitar grant del hito
              </Button>
            </Form>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
