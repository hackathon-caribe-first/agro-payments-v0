import { ActionForm, TextField } from "~/components/action-form";
import { MilestoneCard, MilestoneList } from "~/components/milestone-card";
import { Lines } from "~/components/shares";
import { loadMilestones, milestoneAction } from "~/milestones";
import type { Route } from "./+types/verifier";

export const meta = () => [{ title: "Por revisar · Surco" }];
export const clientLoader = () => loadMilestones();
export const clientAction = ({ request }: Route.ClientActionArgs) => milestoneAction(request);

export default function Verifier({ loaderData }: Route.ComponentProps) {
  const pending = loaderData.filter((m) => m.status === "evidence_submitted");
  const rest = loaderData.filter((m) => m.status !== "evidence_submitted");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Por revisar</h1>
        <p className="mt-2 text-muted-foreground">
          Aprobar un hito paga los jornales del productor y el fee del hito; a los proveedores les paga el operador desde la custodia.
        </p>
      </header>
      {pending.length === 0 && (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">
          No hay evidencias pendientes. Cuando un productor envíe una, aparecerá aquí.
        </p>
      )}
      <MilestoneList>
        {pending.map((m) => (
          <MilestoneCard key={m.id} milestone={m}>
            <blockquote className="border-l-4 border-lime-deep pl-3">{m.evidence?.description}</blockquote>
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-6">
              <ActionForm id={m.id} intent="approve" label="Aprobar hito" />
              <ActionForm id={m.id} intent="observe" label="Observar hito" variant="outline">
                <TextField name="reason" label="¿Qué debe corregir?" />
              </ActionForm>
            </div>
          </MilestoneCard>
        ))}
      </MilestoneList>
      {rest.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="text-xl text-primary">Otros hitos</h2>
          <MilestoneList>
            {rest.map((m) => (
              <MilestoneCard key={m.id} milestone={m}>
                <Lines milestone={m} />
              </MilestoneCard>
            ))}
          </MilestoneList>
        </section>
      )}
    </div>
  );
}
