import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, redirect, useRouteError } from "react-router";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { startBlockText } from "~/components/buyer/project-card";
import { offerFields } from "~/components/negotiation/actions";
import { ScopedOfferForm } from "~/components/negotiation/scoped-offer-form";
import { presaleErrorMessage, toActionData, type PresaleActionData } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/buyer.project.negotiations.new";

export const meta = () => [{ title: "Iniciar negociación · Surco" }];

const milestoneParam = (request: Request) => new URL(request.url).searchParams.get("milestone");

export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const result = await buyer.getStartNegotiationForm(params.projectId, milestoneParam(request));
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const result = await buyer.startNegotiation({ projectId: params.projectId, milestoneId: milestoneParam(request) }, offerFields(form));
  return result.ok ? redirect(`/buyer/negotiations/${result.value.id}`) : toActionData(result.error);
}

export default function BuyerProjectNegotiationsNew({ loaderData, actionData }: Route.ComponentProps) {
  const { catalog, milestone, reference, total, block, myLiveId } = loaderData;
  const { project } = catalog;
  const scopeLabel = milestone ? `Hito ${milestone.sequenceOrder} · ${milestone.title}` : "Proyecto completo";
  return (
    <div className="flex flex-col gap-6">
      <Link to={`/buyer/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al proyecto
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">{project.title}</p>
        <h1 className="text-3xl text-primary">Iniciar negociación</h1>
        <p className="mt-2 text-muted-foreground">{scopeLabel}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-primary">Tu oferta inicial</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {block ? (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-muted-foreground">
                {startBlockText(block, project)}
              </p>
              {block === "duplicate" && myLiveId && (
                <Button asChild variant="outline" size="compact" className="self-start">
                  <Link to={`/buyer/negotiations/${myLiveId}`}>Ver negociación</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="text-pretty text-sm text-muted-foreground">
                {milestone
                  ? "Propón un precio total y una fecha de entrega para este hito. El productor responderá con su oferta o una contraoferta."
                  : `Propón cantidad, unidad, precio y fecha de entrega. El total de la cotización del proyecto hoy es ${formatMoney(total, project.currency)}.`}
              </p>
              {milestone ? (
                <ScopedOfferForm
                  scope="MILESTONE"
                  intent="start"
                  initial={{ price: reference.price ?? undefined, deliveryDate: reference.deliveryDate }}
                  reference={reference.price ?? 0}
                  submitLabel="Enviar oferta"
                  actionData={actionData}
                />
              ) : (
                <ScopedOfferForm scope="PROJECT" intent="start" initial={{ deliveryDate: reference.deliveryDate }} submitLabel="Enviar oferta" actionData={actionData} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar el formulario"}</h1>
      <Link to="/buyer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a los proyectos
      </Link>
    </>
  );
}
