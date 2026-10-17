import { StatementErrorBoundary, StatementPage } from "~/components/statement/statement-page";
import { unwrapOps } from "~/panel/error-copy";
import { statements } from "~/statements/module";
import type { Route } from "./+types/statement.investor";

export const meta = () => [{ title: "Balance de inversión · Surco" }];

// One use case: the investor's balance of the project (partial position until the sale is liquidated).
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrapOps(await statements.getInvestorBalance(params.projectId));
}

export default function InvestorStatementRoute({ loaderData, params }: Route.ComponentProps) {
  return <StatementPage statement={loaderData} back={{ to: `/investor/settlements/${params.projectId}`, label: "Volver a la liquidación" }} />;
}

export function ErrorBoundary() {
  return <StatementErrorBoundary back={{ to: "/investor/settlements", label: "Volver a las liquidaciones" }} />;
}
