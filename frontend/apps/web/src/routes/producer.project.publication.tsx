import { ArrowLeft } from "lucide-react";
import { Form, Link, data, isRouteErrorResponse, redirect, useNavigation, useRouteError } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { SheetView } from "~/components/simulation/sheet-view";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import { simulation } from "~/simulation/module";
import { simulationErrorMessage, toSimulationActionData, type SimulationActionData } from "~/simulation/error-copy";
import type { Route } from "./+types/producer.project.publication";

export const meta = () => [{ title: "Ficha y publicación · Surco" }];

// Fase 0 (RF-06, RF-07, RF-30): the motor's sheet for the project, a «Simular» action and the publication gate.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [project, sheet, presets] = await Promise.all([
    producer.getProjectWithMilestones(params.projectId),
    simulation.getLatestSheet(params.projectId),
    simulation.listPresets(),
  ]);
  if (!project.ok) {
    if (project.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(errorMessage(project.error), { status: 502 });
  }
  if (!sheet.ok) throw new Response(simulationErrorMessage(sheet.error), { status: 502 });
  return { project: project.value.project, sheet: sheet.value, presets: presets.ok ? presets.value : [] };
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<SimulationActionData | Response> {
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (intent === "publish") {
    const result = await simulation.publishProject(params.projectId);
    return result.ok ? redirect(`/producer/projects/${params.projectId}`) : toSimulationActionData(intent, result.error);
  }
  const price = String(form.get("contract_price_per_kg") ?? "").trim();
  const result = await simulation.runSimulation(params.projectId, {
    preset: String(form.get("preset")),
    ...(price === "" ? {} : { contractPricePerKg: Number(price) }),
  });
  return result.ok ? { ok: true, intent } : toSimulationActionData(intent, result.error);
}

function Problem({ data, intent, field }: { data: SimulationActionData | undefined; intent: string; field?: string }) {
  if (!data || data.ok || data.intent !== intent) return null;
  const message = field ? data.fieldErrors?.[field]?.[0] : data.message;
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-destructive">
      ✕ {message}
    </p>
  );
}

export default function ProducerProjectPublication({ loaderData, actionData }: Route.ComponentProps) {
  const { project, sheet, presets } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state !== "idle" ? navigation.formData?.get("intent") : null;
  const isDraft = project.currentStatus === "DRAFT" || project.currentStatus === "CONTRACT_SIGNED";
  return (
    <div className="flex flex-col gap-6">
      <Link to={`/producer/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al proyecto
      </Link>
      <header className="flex flex-col gap-2">
        <p className="self-start rounded-md bg-warning px-2 py-1 text-sm font-semibold text-warning-foreground">Entorno de simulación · Sin dinero real</p>
        <h1 className="break-words text-3xl text-primary">Ficha y publicación</h1>
        <p className="text-muted-foreground">
          {project.projectCode} · {project.title}
        </p>
        <div>
          <ProjectStatusBadge status={project.currentStatus} />
        </div>
      </header>

      <section aria-labelledby="simulate-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <h2 id="simulate-heading" className="text-lg text-primary">
          Simular el proyecto
        </h2>
        <p className="text-muted-foreground">
          El motor corre 20.000 escenarios de clima, rendimiento y precio con una semilla fija y decide si el proyecto se puede ofrecer.
        </p>
        <Form method="post" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="simulate" />
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <span className="font-semibold">Proyecto de referencia</span>
            <select name="preset" defaultValue={sheet?.preset ?? presets[0]?.id ?? "P2"} className="h-11 rounded-md border bg-background px-3">
              {(presets.length > 0 ? presets : [{ id: "P1", name: "P1" }, { id: "P2", name: "P2" }]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
            <span className="font-semibold">Precio de contrato (COP por kg)</span>
            <input name="contract_price_per_kg" type="number" min="1" step="1" inputMode="numeric" placeholder="El del contrato de referencia" className="h-11 rounded-md border bg-background px-3 tabular-nums" />
          </label>
          <Button type="submit" variant="secondary" disabled={busy === "simulate"}>
            {busy === "simulate" ? "Simulando…" : "Simular"}
          </Button>
        </Form>
        <Problem data={actionData} intent="simulate" field="contract_price_per_kg" />
        <Problem data={actionData} intent="simulate" />
      </section>

      {sheet ? (
        <SheetView sheet={sheet} />
      ) : (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Este proyecto aún no tiene ficha. Simúlalo para saber si se puede publicar.</p>
      )}

      {isDraft && (
        <Form method="post" className="flex flex-col gap-2">
          <input type="hidden" name="intent" value="publish" />
          <Button type="submit" className="self-start" disabled={busy === "publish"}>
            {busy === "publish" ? "Publicando…" : "Publicar proyecto"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Al publicar se abre la captación de inversionistas. Solo se publica con el{" "}
            <Link to={`/producer/projects/${project.id}/contracts`} className="font-semibold text-primary underline underline-offset-4">
              contrato de compra
            </Link>{" "}
            registrado y si la última ficha cumple la regla de oferta.
          </p>
          <Problem data={actionData} intent="publish" />
        </Form>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar la ficha"}</h1>
      <p className="mt-2 text-muted-foreground">{notFound ? "Puede que el enlace sea incorrecto o que el proyecto ya no exista." : "Intenta de nuevo en unos minutos."}</p>
      <Link to="/producer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis proyectos
      </Link>
    </>
  );
}
