import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { runProposalAction } from "~/components/investment/actions";
import { investmentErrorMessage } from "~/components/investment/error-copy";
import { ProposalDetail } from "~/components/investment/proposal-detail";
import { producerInvestments } from "~/investment-proposals/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/investment.producer-proposal";

export const meta = () => [{ title: "Propuesta de inversión · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const result = await producerInvestments.getProposalDetail(params.proposalId);
  if (!result.ok) {
    if (result.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(investmentErrorMessage(result.error), { status: 502 });
  }
  return result.value;
}

// The producer answers: accept, reject or counter. There is no withdraw and no way to start a proposal.
export async function clientAction({ params, request }: Route.ClientActionArgs) {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const id = params.proposalId;
  return runProposalAction(
    {
      accept: (revision) => producerInvestments.accept(id, revision),
      reject: (revision) => producerInvestments.reject(id, revision),
      counter: (raw) => producerInvestments.counter(id, raw),
    },
    await request.formData(),
  );
}

export default function ProducerProposal({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <ProposalDetail
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
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos esta propuesta" : "No pudimos cargar la propuesta"}</h1>
      <Link to="/producer/proposals" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a las propuestas
      </Link>
    </>
  );
}
