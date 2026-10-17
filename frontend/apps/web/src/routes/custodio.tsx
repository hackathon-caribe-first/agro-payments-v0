import { ActionForm } from "~/components/action-form";
import { MilestoneCard, MilestoneList } from "~/components/milestone-card";
import { Lines } from "~/components/shares";
import { loadMilestones, milestoneAction } from "~/milestones";
import type { Route } from "./+types/custodio";

export const meta = () => [{ title: "Pagos · Surco" }];
export const clientLoader = () => loadMilestones();
export const clientAction = ({ request }: Route.ClientActionArgs) => milestoneAction(request);

export default function Custodio({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className="text-3xl text-primary">Pagos</h1>
      <p className="mt-2 text-muted-foreground">
        Paga a proveedores y trabajadores durante la ejecución. La línea del productor se libera sola cuando el verificador aprueba.
      </p>
      <MilestoneList>
        {loaderData.map((m) => (
          <MilestoneCard key={m.id} milestone={m}>
            <div className="flex flex-col gap-4">
              <Lines milestone={m} payable />
              {m.lines.some((l) => l.status === "en_cola") && (
                <ActionForm id={m.id} intent="sync" label="Actualizar pagos en cola" variant="outline" />
              )}
            </div>
          </MilestoneCard>
        ))}
      </MilestoneList>
    </>
  );
}
