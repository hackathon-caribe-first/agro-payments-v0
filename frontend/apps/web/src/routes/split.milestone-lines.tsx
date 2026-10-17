import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, redirect, useRouteError, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { isEditable } from "@agro/shared/modules/payment-lines/domain/line";
import { DeadlineBadge } from "~/components/deadline-badge";
import { ContingencyCard } from "~/components/split/contingency-card";
import { LineForm } from "~/components/split/line-form";
import { LinesTable } from "~/components/split/lines-table";
import { SplitSummary } from "~/components/split/split-summary";
import { splitErrorMessage, toSplitActionData, type SplitActionData } from "~/components/split/copy";
import { producerLines } from "~/payment-lines/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/split.milestone-lines";

export const meta = () => [{ title: "Líneas de pago · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producerLines.getMilestoneLines(params.milestoneId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(splitErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

const lineFields = (form: FormData) => ({
  beneficiaryId: text(form, "beneficiaryId"),
  concept: text(form, "concept"),
  reference: text(form, "reference"),
  amountMode: text(form, "amountMode"),
  amount: text(form, "amount"),
  moment: text(form, "moment"),
});

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<SplitActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const intent = form.get("intent");
  const back = redirect(`/producer/milestones/${params.milestoneId}/lines`);

  if (intent === "add") {
    const result = await producerLines.addLine(params.milestoneId, lineFields(form));
    return result.ok ? back : toSplitActionData(result.error);
  }
  if (intent === "update") {
    const result = await producerLines.updateLine(params.milestoneId, text(form, "lineId"), lineFields(form));
    return result.ok ? back : toSplitActionData(result.error);
  }
  if (intent === "remove") {
    const result = await producerLines.removeLine(params.milestoneId, text(form, "lineId"));
    return result.ok ? back : toSplitActionData(result.error);
  }
  // RF-21: funds from the contingency reserve (one use case, one action branch).
  if (intent === "contingency") {
    const result = await producerLines.requestContingencyFunds(params.milestoneId, {
      beneficiaryId: text(form, "beneficiaryId"),
      amount: text(form, "amount"),
      reason: text(form, "reason"),
    });
    return result.ok ? back : { ...toSplitActionData(result.error), intent: "contingency" };
  }
  // RF-11: "Reintentar pago", idempotent by milestone:line.
  if (intent === "retry") {
    const result = await producerLines.retryLinePayment(params.milestoneId, text(form, "lineId"));
    return result.ok ? back : toSplitActionData(result.error);
  }
  return { fieldErrors: { _form: ["Acción desconocida."] } };
}

export default function MilestoneLines({ loaderData, actionData }: Route.ComponentProps) {
  const { milestone, lines, ctx, preview, beneficiaries } = loaderData;
  const [params] = useSearchParams();
  const requested = params.get("edit");
  const editing = lines.find((l) => l.id === requested && isEditable(l)) ?? null;
  const basePath = `/producer/milestones/${milestone.id}/lines`;
  // Each form only sees its own answer.
  const contingencyAction = actionData?.intent === "contingency" ? actionData : undefined;
  const lineAction = actionData?.intent === "contingency" ? undefined : actionData;

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/producer/projects/${milestone.projectId}/lines`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a los hitos del proyecto
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Hito {milestone.sequenceOrder}</p>
        <h1 className="break-words text-3xl text-primary">{milestone.title}</h1>
        {milestone.status && milestone.dueDate && (
          <div>
            <DeadlineBadge status={milestone.status} dueDate={milestone.dueDate} />
          </div>
        )}
        <p className="text-pretty text-muted-foreground">
          Cada línea es un pago directo del inversor a un beneficiario. Lo que sumen las líneas más las comisiones estimadas no puede superar el tope del hito.
        </p>
        <Link to="/producer/lines/example" className="w-fit text-sm font-bold text-primary underline underline-offset-4">
          Ver un ejemplo de reparto con las reglas de cálculo
        </Link>
        {!milestone.producerWallet && milestone.status !== "COMPLETED_AND_PAID" && (
          <p className="text-pretty text-sm text-muted-foreground">
            Este proyecto no tiene billetera del productor registrada, por eso no se planifica la comisión de la plataforma.
          </p>
        )}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <SplitSummary ctx={ctx} preview={preview} />
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <section aria-labelledby="lines-heading" className="flex flex-col gap-4">
            <h2 id="lines-heading" className="text-lg text-primary">
              Líneas de pago ({lines.length})
            </h2>
            <LinesTable ctx={ctx} lines={lines} preview={preview} editPath={basePath} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-primary">{editing ? "Editar línea" : "Agregar línea"}</CardTitle>
            </CardHeader>
            <CardContent>
              <LineForm
                key={`${editing?.id ?? "new"}:${lines.map((l) => `${l.id}.${l.value}`).join(",")}`}
                ctx={ctx}
                lines={lines}
                beneficiaries={beneficiaries}
                editing={editing}
                cancelTo={basePath}
                actionData={lineAction}
              />
            </CardContent>
          </Card>

          <ContingencyCard ctx={ctx} preview={preview} beneficiaries={beneficiaries} open={milestone.status !== "COMPLETED_AND_PAID"} actionData={contingencyAction} />
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este hito" : "No pudimos cargar las líneas de pago"}</h1>
      <p className="mt-2 text-muted-foreground">
        {notFound ? "Puede que el enlace sea incorrecto o que el hito ya no exista." : "Intenta de nuevo en unos minutos."}
      </p>
      <Link to="/producer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis proyectos
      </Link>
    </>
  );
}
