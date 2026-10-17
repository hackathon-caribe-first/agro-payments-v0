import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { runSignAction } from "~/components/investment/actions";
import { ContractView } from "~/components/investment/contract-view";
import { investmentErrorMessage } from "~/components/investment/error-copy";
import { producerInvestments } from "~/investment-proposals/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/investment.producer-contract";

export const meta = () => [{ title: "Contrato · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producerInvestments.getContractDetail(params.contractId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(investmentErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export async function clientAction({ params, request }: Route.ClientActionArgs) {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  return runSignAction(() => producerInvestments.signContract(params.contractId), await request.formData());
}

export default function ProducerContract({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <ContractView
      viewer="PRODUCER"
      detail={loaderData}
      actionData={actionData}
      back={{ to: "/producer/proposals", label: "Volver a las propuestas" }}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este contrato" : "No pudimos cargar el contrato"}</h1>
      <Link to="/producer/proposals" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a las propuestas
      </Link>
    </>
  );
}
