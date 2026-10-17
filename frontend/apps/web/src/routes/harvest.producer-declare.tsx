import { ArrowLeft, ReceiptText } from "lucide-react";
import { Link } from "react-router";
import { declarationBlockers } from "@agro/shared/modules/harvest/domain/rules";
import { BatchSummary } from "~/components/harvest/batch-summary";
import { DeclarationChecklist } from "~/components/harvest/declaration-checklist";
import { DeclareForm } from "~/components/harvest/declare-form";
import { linkClass } from "~/components/harvest/format";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { answer, formFields, forIntent, unwrap, type HarvestActionData } from "~/harvest/action-data";
import { producerHarvest } from "~/harvest/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/harvest.producer-declare";

export const meta = () => [{ title: "Declarar cosecha · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrap(await producerHarvest.getDeclarationContext(params.projectId));
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<HarvestActionData> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const fields = formFields(form);
  if (intent === "declare") return answer(await producerHarvest.declare(params.projectId, fields), intent);
  if (intent === "resubmit") {
    const { batchId, ...rest } = fields;
    return answer(await producerHarvest.resubmit(batchId ?? "", rest), intent);
  }
  return { fieldErrors: { _form: ["Acción desconocida."] }, intent };
}

export default function ProducerHarvest({ loaderData, actionData }: Route.ComponentProps) {
  const { project, milestones, batches } = loaderData;
  const active = [...batches].reverse().find((b) => b.status !== "SOLD_OUT");
  const settled = batches.some((b) => b.status === "SOLD_OUT");
  const blockers = declarationBlockers(project.currentStatus, milestones);
  const answered = forIntent(actionData, "declare", "resubmit");

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/producer/projects/${project.id}`} className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al proyecto
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">{project.title}</p>
        <h1 className="text-3xl text-primary">Cosecha</h1>
        <p className="mt-2 text-muted-foreground">Declara el volumen cosechado y su calidad. Un verificador certificará la cantidad y la calidad antes de publicar el lote en el mercado.</p>
      </header>

      {answered?.done && (
        <p role="status" className="rounded-md bg-secondary p-3 text-sm font-semibold text-primary">
          ✓ {answered.done === "resubmit" ? "Enviamos tus correcciones al verificador." : "Cosecha declarada. El verificador la revisará."}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {active && (
          <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
            <BatchSummary batch={active} />
          </aside>
        )}
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {active ? (
            active.status === "CORRECTIONS_REQUESTED" ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg text-primary">Corrige y vuelve a enviar</h2>
                <DeclareForm resubmit={active} actionData={actionData} />
              </section>
            ) : active.status === "DECLARED_BY_PRODUCER" ? (
              <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
                ◷ Tu declaración está en espera de certificación. Te avisaremos cuando el verificador emita su dictamen.
              </p>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
                <p className="text-muted-foreground">✓ El lote está certificado y publicado en el mercado. Cuando un comprador cree una orden la verás en tus órdenes.</p>
                <Link to="/producer/orders" className={linkClass}>
                  Ver mis órdenes
                </Link>
              </div>
            )
          ) : settled ? (
            <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
              El proyecto ya está liquidado.
            </p>
          ) : blockers.length > 0 ? (
            <DeclarationChecklist milestones={milestones} blockers={blockers} />
          ) : (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg text-primary">Declarar cosecha</h2>
              <DeclareForm actionData={actionData} />
            </section>
          )}
          {settled && (
            <Link to={`/producer/projects/${project.id}/settlement`} className={linkClass}>
              <ReceiptText aria-hidden="true" className="size-4" />
              Ver estado de cuenta final
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos este proyecto" failureTitle="No pudimos cargar la cosecha" backTo="/producer" backLabel="Volver a mis proyectos" />;
}
