import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { runNegotiationAction } from "~/components/negotiation/actions";
import { NegotiationDetail } from "~/components/negotiation/detail";
import { presaleErrorMessage, type PresaleActionData } from "~/components/presale/error-copy";
import { producerPresales } from "~/producer/presales";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/producer.negotiation";

export const meta = () => [{ title: "Negociación · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producerPresales.getRequestDetail(params.negotiationId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(presaleErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const id = params.negotiationId;
  return runNegotiationAction(
    {
      accept: (revision, raw) => producerPresales.acceptSaleQuote(id, revision, raw),
      reject: (revision) => producerPresales.rejectSaleQuote(id, revision),
      counter: (raw) => producerPresales.counterOffer(id, raw),
      withdraw: () => producerPresales.withdrawNegotiation(id),
    },
    await request.formData(),
  );
}

export default function ProducerNegotiation({ loaderData, actionData }: Route.ComponentProps) {
  const { request } = loaderData;
  return (
    <NegotiationDetail
      viewer="PRODUCER"
      detail={loaderData}
      actionData={actionData}
      back={{ to: "/producer/negotiations", label: "Volver a las negociaciones" }}
      openRequestTo={request.openRequestId ? `/producer/open-requests/${request.openRequestId}` : undefined}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos esta negociación" : "No pudimos cargar la negociación"}</h1>
      <Link to="/producer/negotiations" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a las negociaciones
      </Link>
    </>
  );
}
