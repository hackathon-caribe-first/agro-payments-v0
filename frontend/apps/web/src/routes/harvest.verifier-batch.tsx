import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "react-router";
import { BatchSummary } from "~/components/harvest/batch-summary";
import { CertifyForm, CorrectionsForm } from "~/components/harvest/certify-forms";
import { linkClass } from "~/components/harvest/format";
import { HarvestRouteError } from "~/components/harvest/route-error";
import { answer, formFields, unwrap, type HarvestActionData } from "~/harvest-batches/action-data";
import { verifierHarvest } from "~/harvest-batches/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/harvest.verifier-batch";

export const meta = () => [{ title: "Certificar cosecha · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrap(await verifierHarvest.getBatch(params.batchId));
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<HarvestActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const fields = formFields(form);
  if (intent === "certify" || intent === "corrections") {
    const result = intent === "certify" ? await verifierHarvest.certify(params.batchId, fields) : await verifierHarvest.requestCorrections(params.batchId, fields);
    return result.ok ? redirect("/verifier/harvests") : answer(result, intent);
  }
  return { fieldErrors: { _form: ["Acción desconocida."] }, intent };
}

export default function VerifierHarvest({ loaderData: batch, actionData }: Route.ComponentProps) {
  const pending = batch.status === "DECLARED_BY_PRODUCER";
  return (
    <div className="flex flex-col gap-6">
      <Link to="/verifier/harvests" className={linkClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a las cosechas
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">{batch.producerName}</p>
        <h1 className="text-3xl text-primary">Certificar cosecha</h1>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
          <BatchSummary batch={batch} />
        </aside>
        <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">
          {pending ? (
            <>
              <section className="flex flex-col gap-3">
                <h2 className="text-lg text-primary">Dictamen aprobado</h2>
                <p className="text-sm text-muted-foreground">Confirma el peso y la calidad verificados en campo. Al firmar, el lote se publica en el mercado.</p>
                <CertifyForm batch={batch} actionData={actionData} />
              </section>
              <section className="flex flex-col gap-3 border-t pt-6">
                <h2 className="text-lg text-primary">Dictamen observado</h2>
                <p className="text-sm text-muted-foreground">Si algo no cuadra, pide al productor que lo corrija. El lote no se publica hasta que lo reenvíe.</p>
                <CorrectionsForm actionData={actionData} />
              </section>
            </>
          ) : (
            <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
              Esta cosecha ya no está pendiente de dictamen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <HarvestRouteError notFoundTitle="No encontramos esta cosecha" failureTitle="No pudimos cargar la cosecha" backTo="/verifier/harvests" backLabel="Volver a las cosechas" />;
}
