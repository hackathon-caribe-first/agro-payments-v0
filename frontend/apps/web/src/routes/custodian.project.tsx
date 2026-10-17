import { ArrowLeft } from "lucide-react";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { ContractsPanel } from "~/components/contracts/contracts-panel";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { contractsAction, loadContracts } from "~/contracts/module";
import { harvest } from "~/harvest/module";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import type { Route } from "./+types/custodian.project";

export const meta = () => [{ title: "Custodia del proyecto · Surco" }];

// The fiduciaria's view of one project: RF-14 premium from custody, RF-25 indemnity into custody, the policy and the contract
// it signs for the patrimonio autónomo.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  // RF-21: the available balance comes from GET /projects/:id/custody (credits minus everything paid out); optional, like on the producer page.
  const [project, contracts, custody] = await Promise.all([
    producer.getProjectWithMilestones(params.projectId),
    loadContracts(params.projectId),
    harvest.custody(params.projectId),
  ]);
  if (!project.ok) {
    if (project.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(errorMessage(project.error), { status: 502 });
  }
  return { project: project.value.project, custody: custody.ok ? custody.value : null, ...contracts };
}

export const clientAction = ({ params, request }: Route.ClientActionArgs) => contractsAction(params.projectId, request);

export default function CustodianProject({ loaderData, actionData }: Route.ComponentProps) {
  const { project, custody, purchase, policy, contract, claims } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/custodian" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a pagos desde la custodia
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="break-words text-3xl text-primary">Seguro y contrato del proyecto</h1>
        <p className="text-muted-foreground">
          {project.projectCode} · {project.title} ·{" "}
          {custody ? (
            <>
              saldo disponible en custodia{" "}
              <span className={custody.overdrawn ? "font-semibold tabular-nums text-destructive" : "font-semibold tabular-nums text-foreground"}>
                {formatMoney(custody.balance, custody.currency)}
              </span>
            </>
          ) : (
            <>
              depositado en custodia{" "}
              <span className="font-semibold tabular-nums text-foreground">{formatMoney(project.custodyBalance, project.currency)}</span>
            </>
          )}
        </p>
        {custody?.overdrawn && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            ✕ Custodia sobregirada: salió más dinero del que ha ingresado.
          </p>
        )}
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
