import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { runNegotiationAction } from "~/components/negotiation/actions";
import { NegotiationDetail } from "~/components/negotiation/detail";
import { presaleErrorMessage, type PresaleActionData } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/buyer.negotiation";

export const meta = () => [{ title: "Negociación · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await buyer.getRequestDetail(params.negotiationId);
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
      accept: (revision, raw) => buyer.acceptSaleQuote(id, revision, raw),
      reject: (revision) => buyer.rejectSaleQuote(id, revision),
      counter: (raw) => buyer.counterOffer(id, raw),
      withdraw: () => buyer.withdrawNegotiation(id),
      authorizePayment: (raw) => buyer.authorizeProjectPayment(id, raw),
    },
    await request.formData(),
  );
}

export default function BuyerNegotiation({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <NegotiationDetail
      viewer="BUYER"
      detail={loaderData}
      actionData={actionData}
      back={{ to: "/buyer/negotiations", label: "Volver a mis negociaciones" }}
      openRequestTo={loaderData.request.openRequestId ? `/buyer/open-requests/${loaderData.request.openRequestId}` : undefined}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos esta negociación" : "No pudimos cargar la negociación"}</h1>
      <Link to="/buyer/negotiations" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis negociaciones
      </Link>
    </>
  );
}
