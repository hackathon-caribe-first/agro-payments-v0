import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { OpenRequestBoardView } from "~/components/open-request/board";
import { OpenRequestViewBadge } from "~/components/open-request/view-badge";
import { presaleErrorMessage, toActionData, type PresaleActionData } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/buyer.open-request";

export const meta = () => [{ title: "Solicitud abierta · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await buyer.getOpenRequestBoard(params.openRequestId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData> {
  const form = await request.formData();
  if (form.get("intent") !== "close") return { fieldErrors: { _form: ["Acción desconocida."] } };
  const result = await buyer.closeOpenRequest(params.openRequestId);
  return result.ok ? { fieldErrors: {} } : toActionData(result.error);
}

export default function BuyerOpenRequest({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <Link to="/buyer/open-requests" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a solicitudes abiertas
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Solicitud abierta</p>
          <h1 className="break-words text-3xl text-primary">{loaderData.openRequest.title}</h1>
        </div>
        <OpenRequestViewBadge view={loaderData.view} />
      </header>
      <OpenRequestBoardView board={loaderData} actionData={actionData} />
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos esta solicitud abierta" : "No pudimos cargar la solicitud abierta"}</h1>
      <Link to="/buyer/open-requests" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a solicitudes abiertas
      </Link>
    </>
  );
}
