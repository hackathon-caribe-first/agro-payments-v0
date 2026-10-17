import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { runProposalAction } from "~/components/investment/actions";
import { investmentErrorMessage } from "~/components/investment/error-copy";
import { ProposalDetail } from "~/components/investment/proposal-detail";
import { investor } from "~/investment-proposals/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/investment.proposal";

export const meta = () => [{ title: "Propuesta · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await investor.getProposalDetail(params.proposalId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(investmentErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

export async function clientAction({ params, request }: Route.ClientActionArgs) {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const id = params.proposalId;
  return runProposalAction(
    {
      accept: (revision) => investor.accept(id, revision),
      reject: (revision) => investor.reject(id, revision),
      counter: (raw) => investor.counter(id, raw),
      withdraw: () => investor.withdraw(id),
    },
    await request.formData(),
  );
}

export default function InvestorProposal({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <ProposalDetail
      viewer="INVESTOR"
      detail={loaderData}
      actionData={actionData}
      back={{ to: "/investor/proposals", label: "Volver a mis propuestas" }}
    />
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos esta propuesta" : "No pudimos cargar la propuesta"}</h1>
      <Link to="/investor/proposals" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis propuestas
      </Link>
    </>
  );
}
