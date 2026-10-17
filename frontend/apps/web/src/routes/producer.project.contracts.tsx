import { ArrowLeft } from "lucide-react";
import { Link, data, isRouteErrorResponse, useRouteError } from "react-router";
import { ContractsPanel } from "~/components/contracts/contracts-panel";
import { ProjectStatusBadge } from "~/components/producer/project-status";
import { contractsAction, loadContracts } from "~/contracts/module";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import type { Route } from "./+types/producer.project.contracts";

export const meta = () => [{ title: "Contratos y seguro · Surco" }];

// Fase 0 (RF-04, RF-05, RF-09): the purchase contract before publishing, the ISA policy and the project contract with its signatures.
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [project, contracts] = await Promise.all([producer.getProjectWithMilestones(params.projectId), loadContracts(params.projectId)]);
  if (!project.ok) {
    if (project.error.kind === "not_found") throw data(null, { status: 404 });
    throw new Response(errorMessage(project.error), { status: 502 });
  }
  return { project: project.value.project, ...contracts };
}

export const clientAction = ({ params, request }: Route.ClientActionArgs) => contractsAction(params.projectId, request);

export default function ProducerProjectContracts({ loaderData, actionData }: Route.ComponentProps) {
  const { project, purchase, policy, contract, claims } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to={`/producer/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al proyecto
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="break-words text-3xl text-primary">Contratos y seguro</h1>
        <p className="text-muted-foreground">
          {project.projectCode} · {project.title}
        </p>
        <div>
          <ProjectStatusBadge status={project.currentStatus} />
        </div>
      </header>
      <ContractsPanel
        audience="producer"
        purchase={purchase}
        policy={policy}
        contract={contract}
        claims={claims}
        actionData={actionData && !(actionData instanceof Response) ? actionData : undefined}
        beforePublishing={project.currentStatus === "DRAFT" || project.currentStatus === "CONTRACT_SIGNED"}
      />
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar los contratos"}</h1>
      <p className="mt-2 text-muted-foreground">{notFound ? "Puede que el enlace sea incorrecto o que el proyecto ya no exista." : "Intenta de nuevo en unos minutos."}</p>
      <Link to="/producer" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis proyectos
      </Link>
    </>
  );
}
