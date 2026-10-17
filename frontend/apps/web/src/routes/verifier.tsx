import { ActionForm, TextField } from "~/components/action-form";
import { HarvestCard, HarvestStepForm } from "~/components/harvest/harvest-card";
import { MilestoneCard, MilestoneList } from "~/components/milestone-card";
import { Lines } from "~/components/shares";
import { harvest, harvestAction, isHarvestIntent } from "~/harvest/module";
import { loadMilestones, milestoneAction } from "~/milestones";
import type { Route } from "./+types/verifier";

export const meta = () => [{ title: "Por revisar · Surco" }];
// RF-24: the harvest queue is optional; the milestone review still works without it.
export async function clientLoader() {
  const [milestones, harvests] = await Promise.all([loadMilestones(), harvest.listForReview()]);
  return { milestones, harvests: harvests.ok ? harvests.value : [] };
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.clone().formData();
  return isHarvestIntent(form.get("intent")) ? harvestAction(form) : milestoneAction(request);
}

export default function Verifier({ loaderData }: Route.ComponentProps) {
  const { milestones, harvests } = loaderData;
  const pending = milestones.filter((m) => m.status === "evidence_submitted");
  const rest = milestones.filter((m) => m.status !== "evidence_submitted");
  const toCertify = harvests.filter((h) => h.harvest?.status === "DECLARED");

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
      {toCertify.length > 0 && (
        <section aria-labelledby="harvests-heading" className="flex flex-col gap-4">
          <h2 id="harvests-heading" className="text-xl text-primary">
            Cosechas por certificar
          </h2>
          {toCertify.map((h) => (
            <HarvestCard key={h.projectId} title={`${h.projectCode} · ${h.projectTitle}`} harvest={h.harvest}>
              <blockquote className="border-l-4 border-lime-deep pl-3">{h.harvest?.evidence}</blockquote>
              <HarvestStepForm
                projectId={h.projectId}
                intent="certify-harvest"
                label="Certificar cosecha"
                fields={[
                  { name: "quantityKg", errorKey: "certified_quantity_kg", label: "Cantidad certificada Q (kg)", numeric: true },
                  { name: "qualityGrade", errorKey: "quality_grade", label: "Calidad certificada" },
                  {
                    name: "pricePerKg",
                    errorKey: "price.price_per_kg",
                    label: "Precio por kilo (COP)",
                    hint: "Sin contrato de compra registrado, este precio define la orden Q × P.",
                    numeric: true,
                  },
                  { name: "notes", errorKey: "notes", label: "Notas (opcional)", hint: "Humedad, residuos u otros hallazgos.", multiline: true },
                ]}
              />
            </HarvestCard>
          ))}
        </section>
      )}
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
