import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { ContractsPanel } from "~/components/contracts/contracts-panel";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { contractsAction, loadContracts } from "~/contracts/module";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import type { Route } from "./+types/custodian.project";

export const meta = () => [{ title: "Custodia del proyecto · Surco" }];

// The fiduciaria's view of one project: RF-14 premium from custody, RF-25 indemnity into custody, the policy and the contract
// it signs for the patrimonio autónomo.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [project, contracts] = await Promise.all([producer.getProjectWithMilestones(params.projectId), loadContracts(params.projectId)]);
  if (!project.ok) {
    if (project.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(errorMessage(project.error), { status: 502 });
  }
  return { project: project.value.project, ...contracts };
}

export const clientAction = ({ params, request }: Route.ClientActionArgs) => contractsAction(params.projectId, request);

export default function CustodianProject({ loaderData, actionData }: Route.ComponentProps) {
  const { project, purchase, policy, contract, claims } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/custodian" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a pagos desde la custodia
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="break-words text-3xl text-primary">Seguro y contrato del proyecto</h1>
        <p className="text-muted-foreground">
          {project.projectCode} · {project.title} · saldo en custodia{" "}
          <span className="font-semibold tabular-nums text-foreground">{project.custodyBalance.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</span>
        </p>
        <div>
          <ProjectStatusBadge status={project.currentStatus} />
        </div>
      </header>
      <ContractsPanel
        audience="custodian"
        purchase={purchase}
        policy={policy}
        contract={contract}
        claims={claims}
        actionData={actionData && !(actionData instanceof Response) ? actionData : undefined}
        beforePublishing={false}
      />
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar el proyecto"}</h1>
      <p className="mt-2 text-muted-foreground">{notFound ? "Revisa el identificador del proyecto." : "Intenta de nuevo en unos minutos."}</p>
      <Link to="/custodian" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a pagos desde la custodia
      </Link>
    </>
  );
}
