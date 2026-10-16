import { ActionForm, TextField } from "~/components/action-form";
import { MilestoneCard, MilestoneList } from "~/components/milestone-card";
import { loadMilestones, milestoneAction } from "~/milestones";
import type { Route } from "./+types/productor";

export const meta = () => [{ title: "Mis hitos · Surco" }];
export const clientLoader = () => loadMilestones();
export const clientAction = ({ request }: Route.ClientActionArgs) => milestoneAction(request);

export default function Productor({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1 className="text-3xl text-primary">Mis hitos</h1>
      <p className="mt-2 text-muted-foreground">Envía la evidencia de cada etapa para que la verifiquen.</p>
      <MilestoneList>
        {loaderData.map((m) => (
          <MilestoneCard key={m.id} milestone={m}>
            {m.status === "rejected" && (
              <p className="mb-3 text-destructive">
                <span className="font-semibold">Motivo:</span> {m.review?.reason}
              </p>
            )}
            {(m.status === "draft" || m.status === "rejected") && (
              <ActionForm id={m.id} intent="evidence" label="Enviar a revisión">
                <TextField name="description" label="Describe tu evidencia" hint="Qué hiciste y qué muestra la foto o el documento." />
              </ActionForm>
            )}
            {m.status === "evidence_submitted" && (
              <p className="text-muted-foreground">Tu evidencia quedó guardada. Falta revisión técnica.</p>
            )}
          </MilestoneCard>
        ))}
      </MilestoneList>
    </>
  );
}
