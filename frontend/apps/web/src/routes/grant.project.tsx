import { ArrowLeft } from "lucide-react";
import { Link, isRouteErrorResponse, redirect, useRouteError } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { milestoneGrantStates } from "@agro/shared/modules/grants/domain/grant-rules";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { toGrantActionData, type GrantActionData } from "~/components/grant/error-copy";
import { MilestoneGrantRow } from "~/components/grant/milestone-grant-row";
import { investor, unwrapGrant } from "~/grants/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/grant.project";

export const meta = () => [{ title: "Grants del proyecto · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrapGrant(await investor.getProjectGrants(params.projectId));
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<GrantActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  if (form.get("intent") !== "request") return { fieldErrors: { [FORM_LEVEL_KEY]: ["Acción desconocida."] } };
  const result = await investor.requestGrant(params.projectId, { milestoneId: String(form.get("milestoneId") ?? "") });
  // The new grant waits for the investor in the wallet: go straight to the consent step.
  return result.ok ? redirect(`/investor/grants/${result.value.id}/approve`) : toGrantActionData(result.error);
}

export default function InvestorProjectGrants({ loaderData, actionData }: Route.ComponentProps) {
  const { project, milestones, grants } = loaderData;
  const states = milestoneGrantStates(milestones, grants);
  const formError = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  return (
    <div className="flex flex-col gap-6">
      <Link to="/investor/grants" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a mis grants
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">Grants del proyecto</p>
        <h1 className="break-words text-3xl text-primary">{project.title}</h1>
        <p className="mt-2 max-w-prose text-pretty text-muted-foreground">
          El grant de un hito solo se puede pedir cuando se revocó el del hito anterior. Así nunca hay dos permisos vivos para el mismo hito.
        </p>
      </header>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
        {milestones.map((milestone) => {
          const state = states.get(milestone.id);
          return state ? <MilestoneGrantRow key={milestone.id} milestone={milestone} currency={project.currency} state={state} /> : null;
        })}
      </ul>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar los grants del proyecto"}</h1>
      <Link to="/investor/grants" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis grants
      </Link>
    </>
  );
}
