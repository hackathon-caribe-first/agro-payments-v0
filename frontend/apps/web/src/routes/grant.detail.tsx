import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { Form, Link, isRouteErrorResponse, useNavigation, useRouteError, useSearchParams } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { canApprove, canRevoke } from "@agro/shared/modules/grants/domain/grant-rules";
import type { PendingRetry } from "@agro/shared/modules/payment-lines/domain/line";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { DeadlineBadge } from "~/components/deadline-badge";
import { ApprovalSteps } from "~/components/grant/approval-steps";
import { toGrantActionData, type GrantActionData } from "~/components/grant/error-copy";
import { GrantSummary } from "~/components/grant/grant-summary";
import { GrantTimeline } from "~/components/grant/grant-timeline";
import { ReceiptsTable } from "~/components/grant/receipts-table";
import { RevocationProof } from "~/components/grant/revocation-proof";
import { RevokeDialog } from "~/components/grant/revoke-dialog";
import { GrantStatusBadge } from "~/components/grant/status";
import { PendingRetryBanner } from "~/components/split/pending-retry-banner";
import { investor, unwrapGrant } from "~/grants/module";
import { milestonePayments } from "~/payment-lines/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/grant.detail";

export const meta = () => [{ title: "Grant · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const detail = unwrapGrant(await investor.getGrantDetail(params.grantId));
  const payments = await milestonePayments.getPendingRetry(detail.milestone.id);
  const pending: PendingRetry = payments.ok ? payments.value : { count: 0, lines: [] };
  return { ...detail, pending };
}

export async function clientAction({ params, request }: Route.ClientActionArgs): Promise<GrantActionData> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  const intent = form.get("intent");
  const id = params.grantId;
  if (intent === "revoke") {
    const result = await investor.revokeGrant(id, { reason: form.get("reason") ?? undefined });
    return result.ok ? { fieldErrors: {}, done: "revoked" } : toGrantActionData(result.error);
  }
  if (intent === "rotate") {
    const result = await investor.rotateToken(id);
    return result.ok ? { fieldErrors: {}, done: "rotated" } : toGrantActionData(result.error);
  }
  return { fieldErrors: { [FORM_LEVEL_KEY]: ["Acción desconocida."] } };
}

const DONE_TEXT: Record<string, string> = {
  revoked: "Grant revocado. Los tokens guardados se borraron y lo que no se gastó sigue en tu billetera.",
  rotated: "Token rotado. El grant sigue activo con el mismo tope.",
};

export default function InvestorGrantDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { grant, project, milestone, events, receipts, pending: unpaid } = loaderData;
  const [params] = useSearchParams();
  const pending = useNavigation().state !== "idle";
  const approved = params.get("approved") === "1" && grant.status === "ACTIVE";
  const formError = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  const done = actionData?.done ? DONE_TEXT[actionData.done] : null;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/investor/grants" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a mis grants
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{project.title}</p>
          <h1 className="break-words text-3xl text-primary">
            Hito {milestone.sequenceOrder} · {milestone.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GrantStatusBadge status={grant.status} />
          {grant.status !== "REVOKED" && <DeadlineBadge status={milestone.status} dueDate={milestone.estimatedCompletionDate} />}
        </div>
      </header>

      {(approved || done) && (
        <p role="status" className="rounded-md bg-secondary px-4 py-3 text-sm font-semibold text-primary">
          ✓ {done ?? "Aprobación verificada. El grant está activo y la plataforma ya puede pagar las líneas del hito hasta el tope."}
        </p>
      )}
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <PendingRetryBanner pending={unpaid} />

      {grant.status !== "REVOKED" && <ApprovalSteps grant={grant} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <GrantSummary grant={grant} />
          {grant.status === "REVOKED" && <RevocationProof grant={grant} />}
          {(canApprove(grant) || canRevoke(grant)) && (
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-base text-primary">Acciones</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4">
                {canApprove(grant) && (
                  <Button asChild size="compact" className="self-start">
                    <Link to={`/investor/grants/${grant.id}/approve`}>
                      <ShieldCheck aria-hidden="true" />
                      Aprobar grant
                    </Link>
                  </Button>
                )}
                {canRevoke(grant) && (
                  <>
                    <RevokeDialog grant={grant} actionData={actionData} />
                    <Form method="post">
                      <input type="hidden" name="intent" value="rotate" />
                      <Button type="submit" variant="ghost" size="compact" disabled={pending}>
                        <RefreshCw aria-hidden="true" />
                        Rotar token
                      </Button>
                    </Form>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <ReceiptsTable receipts={receipts} currency={grant.currency} />
          <GrantTimeline events={events} currency={grant.currency} />
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este grant" : "No pudimos cargar el grant"}</h1>
      <Link to="/investor/grants" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a mis grants
      </Link>
    </>
  );
}
