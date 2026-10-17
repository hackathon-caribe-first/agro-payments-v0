import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Form, Link, isRouteErrorResponse, redirect, useNavigation, useRouteError } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Alert, AlertDescription, AlertTitle } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Checkbox } from "@agro/shared/ui/checkbox";
import { Label } from "@agro/shared/ui/label";
import { ApprovalSteps } from "~/components/grant/approval-steps";
import { toGrantActionData, type GrantActionData } from "~/components/grant/error-copy";
import { investor, INVESTOR_PROFILE, unwrapGrant } from "~/grants/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/grant.approve";

export const meta = () => [{ title: "Aprobar grant · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const detail = unwrapGrant(await investor.getGrantDetail(params.grantId));
  // Only a pending grant waits for consent: anything else lands on the detail.
  if (detail.grant.status !== "PENDING_APPROVAL") throw redirect(`/investor/grants/${params.grantId}`);
  return detail;
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<GrantActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const id = params.grantId;
  if (form.get("intent") === "deny") {
    const result = await investor.denyGrant(id);
    return result.ok ? redirect(`/investor/grants/${id}`) : toGrantActionData(result.error);
  }
  if (form.get("intent") === "approve") {
    // The wallet answers, then the platform verifies the hash and continues the grant: both run inside this one use case.
    const result = await investor.approveGrant(id, { accountConfirmed: form.get("accountConfirmed") ?? undefined });
    return result.ok ? redirect(`/investor/grants/${id}?approved=1`) : toGrantActionData(result.error);
  }
  return { fieldErrors: { [FORM_LEVEL_KEY]: ["Acción desconocida."] } };
}

// Models the consent screen of the investor wallet: what is being asked, for how much and for how long.
export default function ApproveGrant({ loaderData, actionData }: Route.ComponentProps) {
  const { grant, project, milestone } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const verifying = submitting && navigation.formData?.get("intent") === "approve";
  const formError = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  const accountError = actionData?.fieldErrors.accountConfirmed?.join(" ");

  return (
    <div className="flex w-full flex-col gap-6">
      <Link to={`/investor/grants/${grant.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al grant
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">Billetera · {INVESTOR_PROFILE.name}</p>
        <h1 className="text-balance text-3xl text-primary">Surco pide permiso para pagar desde tu billetera</h1>
      </header>

      <ApprovalSteps grant={grant} verifying={verifying} />
      <p aria-live="polite" className="sr-only">
        {verifying ? "Verificando aprobación" : ""}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-primary">Permiso solicitado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Tope máximo</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatMoney(grant.capAmount, grant.currency)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Vigencia</dt>
              <dd className="font-semibold">Hasta cerrar el hito, sin periodos</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Proyecto</dt>
              <dd className="break-words font-semibold">{project.title}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hito</dt>
              <dd className="break-words font-semibold">
                {milestone.sequenceOrder} · {milestone.title}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Billetera que paga</dt>
              <dd className="break-all font-semibold">{grant.wallet}</dd>
            </div>
          </dl>
          <p className="text-pretty text-sm text-muted-foreground">
            Solo podrá crear y consultar pagos de este hito, hasta el tope. Tu dinero se queda en tu billetera y el permiso se revoca al cerrar el hito.
          </p>

          <Alert>
            <AlertTitle>Entra con la cuenta dueña de la billetera</AlertTitle>
            <AlertDescription>
              Si tu navegador tiene abierta la billetera con otra cuenta, verás «Access to the given resource is forbidden». Cierra esa sesión, entra con la
              cuenta dueña de {INVESTOR_PROFILE.wallet} y vuelve a intentarlo.
            </AlertDescription>
          </Alert>

          {formError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {formError}{" "}
                <Link to={`/investor/grants/${grant.id}/approve`} reloadDocument className="font-semibold underline underline-offset-4">
                  Reintentar
                </Link>
              </AlertDescription>
            </Alert>
          )}

          <Form method="post" className="flex flex-col gap-4" noValidate>
            <div className="flex items-start gap-2">
              <Checkbox
                id="accountConfirmed"
                name="accountConfirmed"
                aria-invalid={accountError ? true : undefined}
                aria-describedby={accountError ? "accountConfirmed-error" : undefined}
                className="mt-0.5"
              />
              <Label htmlFor="accountConfirmed" className="text-sm font-normal">
                Estoy usando la cuenta dueña de esta billetera
              </Label>
            </div>
            {accountError && (
              <p id="accountConfirmed-error" role="alert" className="-mt-2 text-sm text-destructive">
                {accountError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="submit" name="intent" value="approve" size="compact" disabled={submitting}>
                <ShieldCheck aria-hidden="true" />
                {verifying ? "Verificando aprobación" : "Aprobar"}
              </Button>
              <Button type="submit" name="intent" value="deny" variant="outline" size="compact" disabled={submitting}>
                Rechazar
              </Button>
            </div>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este grant" : "No pudimos cargar la aprobación"}</h1>
      <Link to="/investor/grants" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis grants
      </Link>
    </>
  );
}
