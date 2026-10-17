import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import type { GrantView } from "@agro/shared/modules/grants/domain/grant";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { GrantProgress } from "./grant-progress";
import { GrantStatusBadge } from "./status";

// One grant in the investor list: which project and milestone it covers, its state and how much of the cap is spent.
export function GrantCard({ view }: { view: GrantView }) {
  const { grant, project, milestone } = view;
  const to = `/investor/grants/${grant.id}`;
  const action = grant.status === "PENDING_APPROVAL" ? { label: "Revisar y aprobar", to: `${to}/approve` } : { label: "Ver detalle", to };
  return (
    <li className="min-w-0">
      <Card className="h-full">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm text-muted-foreground">{project.title}</p>
              <CardTitle className="break-words text-lg text-primary">
                Hito {milestone.sequenceOrder} · {milestone.title}
              </CardTitle>
            </div>
            <GrantStatusBadge status={grant.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <GrantProgress grant={grant} label={`Gastado del tope del hito ${milestone.sequenceOrder}`} />
          <Button asChild variant={grant.status === "PENDING_APPROVAL" ? "default" : "outline"} size="compact" className="self-start">
            <Link to={action.to}>
              {action.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}
