import { Link, data, isRouteErrorResponse, redirectDocument, useRouteError, useSearchParams } from "react-router";
import type { PresaleResult } from "@agro/shared/modules/presales/domain/errors";
import type { QuoteRequest } from "@agro/shared/modules/presales/domain/presale";
import { runNegotiationAction } from "~/components/negotiation/actions";
import { NegotiationDetail } from "~/components/negotiation/detail";
import { presaleErrorMessage, type PresaleActionData } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
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

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<PresaleActionData | Response> {
  const id = params.negotiationId;
  // Open Payments: a deposit that needs the buyer's wallet approval answers with its consent URL, and the app leaves for it.
  let walletUrl: string | undefined;
  const followWallet = async (pending: Promise<PresaleResult<QuoteRequest>>) => {
    const result = await pending;
    if (result.ok) walletUrl = result.value.depositRedirectUrl;
    return result;
  };
  const outcome = await runNegotiationAction(
    {
      accept: (revision, raw) => followWallet(buyer.acceptSaleQuote(id, revision, raw)),
      reject: (revision) => buyer.rejectSaleQuote(id, revision),
      counter: (raw) => buyer.counterOffer(id, raw),
      withdraw: () => buyer.withdrawNegotiation(id),
      deposit: (raw) => followWallet(buyer.depositProjectAgreement(id, raw)),
    },
    await request.formData(),
  );
  // redirectDocument + absolute URL: a full page load to the wallet, never a client-side navigation.
  return walletUrl ? redirectDocument(walletUrl) : outcome;
}

// The wallet sends the browser back here with ?deposit=ok or ?deposit=error.
function DepositResult() {
  const [params] = useSearchParams();
  const result = params.get("deposit");
  if (result === "ok") {
    return (
      <p role="status" className="mb-6 rounded-md bg-secondary px-4 py-3 font-semibold text-primary">
        ✓ Aprobaste el depósito en tu billetera. El total quedó registrado en la custodia del proyecto.
      </p>
    );
  }
  if (result === "error") {
    return (
      <p role="alert" className="mb-6 rounded-md border border-destructive bg-card px-4 py-3 font-semibold text-destructive">
        ✕ No se completó el depósito: no aprobaste el permiso en tu billetera o el pago falló. Puedes intentarlo de nuevo.
      </p>
    );
  }
  return null;
}

export default function BuyerNegotiation({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <>
      <DepositResult />
      <NegotiationDetail
        viewer="BUYER"
        detail={loaderData}
        actionData={actionData}
        back={{ to: "/buyer/negotiations", label: "Volver a mis negociaciones" }}
        openRequestTo={loaderData.request.openRequestId ? `/buyer/open-requests/${loaderData.request.openRequestId}` : undefined}
      />
    </>
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
