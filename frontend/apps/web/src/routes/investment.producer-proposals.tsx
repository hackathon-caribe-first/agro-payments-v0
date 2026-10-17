import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { investmentErrorMessage } from "~/components/investment/error-copy";
import { ProposalListItem } from "~/components/investment/proposal-list-item";
import { producerInvestments } from "~/investments/module";
import type { Route } from "./+types/investment.producer-proposals";

export const meta = () => [{ title: "Propuestas de inversión · Surco" }];

export async function clientLoader() {
  const result = await producerInvestments.listProposals();
  if (!result.ok) throw new Response(investmentErrorMessage(result.error), { status: 502 });
  return { entries: result.value };
}

export default function ProducerProposals({ loaderData }: Route.ComponentProps) {
  const { entries } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/producer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a mis proyectos
      </Link>
      <header>
        <h1 className="text-3xl text-primary">Propuestas de inversión</h1>
        <p className="mt-2 text-muted-foreground">Responde a los inversores interesados en tus proyectos: acepta, rechaza o envía una contraoferta.</p>
      </header>
      {entries.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no recibes propuestas de inversión.</p>
      ) : (
        <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
          {entries.map((entry) => (
            <ProposalListItem key={entry.proposal.id} entry={entry} viewer="PRODUCER" />
          ))}
        </ul>
      )}
    </div>
  );
}
