import { StatementErrorBoundary, StatementPage } from "~/components/statement/statement-page";
import { unwrapOps } from "~/panel/error-copy";
import { statements } from "~/statements/module";
import type { Route } from "./+types/statement.producer";

export const meta = () => [{ title: "Estado de cuenta final · Surco" }];

// One use case: the producer's final statement of the project.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrapOps(await statements.getProducerStatement(params.projectId));
}

export default function ProducerStatementRoute({ loaderData, params }: Route.ComponentProps) {
  return <StatementPage statement={loaderData} back={{ to: `/producer/projects/${params.projectId}`, label: "Volver al proyecto" }} />;
}

export function ErrorBoundary() {
  return <StatementErrorBoundary back={{ to: "/producer", label: "Volver a mis proyectos" }} />;
}
