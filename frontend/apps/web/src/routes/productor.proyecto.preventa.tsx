import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { publishBlock } from "@agro/shared/modules/presales/domain/presale-rules";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { presaleErrorMessage, toActionData, type PresaleActionData } from "~/components/presale/error-copy";
import { ListingPanel } from "~/components/producer/presale/listing-panel";
import { PublishListingForm } from "~/components/producer/presale/publish-listing-form";
import { RequestInboxItem } from "~/components/producer/presale/request-inbox-item";
import { producerPresales } from "~/producer/presales";
import type { Route } from "./+types/productor.proyecto.preventa";

export const meta = () => [{ title: "Preventa · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producerPresales.getProjectPresale(params.projectId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData> {
  const form = await request.formData();

  if (form.get("intent") === "close") {
    const result = await producerPresales.closeListing(text(form, "listingId"));
    return result.ok ? { fieldErrors: {} } : toActionData(result.error);
  }

  if (form.get("intent") === "publish") {
    const result = await producerPresales.publishListing(params.projectId, {
      title: text(form, "title"),
      summary: text(form, "summary"),
      expectedQuantity: text(form, "expectedQuantity"),
      unit: text(form, "unit"),
      referenceUnitPrice: text(form, "referenceUnitPrice"),
      estimatedHarvestDate: text(form, "estimatedHarvestDate"),
    });
    return result.ok ? { fieldErrors: {} } : toActionData(result.error);
  }

  return { fieldErrors: { _form: ["Acción desconocida."] } };
}

export default function ProductorProyectoPreventa({ loaderData, actionData }: Route.ComponentProps) {
  const { project, listing, requests } = loaderData;
  // Projects that can never sell show the reason instead of a form that would only fail on submit.
  const blocked = !listing && publishBlock(project.currentStatus, []) === "project_status";
  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/productor/proyectos/${project.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al proyecto
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{project.projectCode}</p>
          <h1 className="break-words text-3xl text-primary">Preventa</h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Ofrece tu producción futura a compradores y responde sus solicitudes de cotización.
          </p>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-lg text-primary">{listing ? "Preventa abierta" : blocked ? "Preventa no disponible" : "Publicar preventa"}</CardTitle>
          </CardHeader>
          <CardContent>
            {listing ? (
              <ListingPanel listing={listing} actionData={actionData} />
            ) : blocked ? (
              <p className="text-muted-foreground">
                {presaleErrorMessage({ kind: "invalid_transition", from: project.currentStatus, action: "publish" })}
              </p>
            ) : (
              <PublishListingForm actionData={actionData} />
            )}
          </CardContent>
        </Card>

        <section aria-labelledby="inbox-heading" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="inbox-heading" className="text-lg text-primary">
              Solicitudes de cotización
            </h2>
            <Button asChild variant="outline" size="compact">
              <Link to={`/productor/solicitudes?proyecto=${project.id}`}>
                Ver todas
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          {requests.length === 0 ? (
            <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no hay solicitudes para este proyecto.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {requests.slice(0, 3).map((entry) => (
                <RequestInboxItem key={entry.request.id} entry={entry} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar la preventa"}</h1>
      <p className="mt-2 text-muted-foreground">
        {notFound ? "Puede que el enlace sea incorrecto o que el proyecto ya no exista." : "Intenta de nuevo en unos minutos."}
      </p>
      <Link to="/productor" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis proyectos
      </Link>
    </>
  );
}
