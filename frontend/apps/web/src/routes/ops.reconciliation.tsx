import { isRouteErrorResponse, useRouteError } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { BeneficiaryCard } from "~/components/reconciliation/beneficiary-group";
import { ReconciliationSummaryView } from "~/components/reconciliation/summary";
import { opsErrorMessage, unwrapOps } from "~/panel/error-copy";
import { reconciliation } from "~/reconciliation/module";
import type { ReconcileActionData } from "~/reconciliation/action-data";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/ops.reconciliation";

export const meta = () => [{ title: "Conciliación · Surco" }];

export async function clientLoader() {
  return unwrapOps(await reconciliation.load());
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<ReconcileActionData> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  if (form.get("intent") !== "review") return { ok: false, fieldErrors: { [FORM_LEVEL_KEY]: ["Acción desconocida."] } };
  const result = await reconciliation.review(String(form.get("entryId") ?? ""), { note: String(form.get("note") ?? "") });
  if (result.ok) return { ok: true };
  if (result.error.kind === "validation") return { ok: false, fieldErrors: result.error.fieldErrors };
  return { ok: false, fieldErrors: { [FORM_LEVEL_KEY]: [opsErrorMessage(result.error)] } };
}

export default function Reconciliation({ loaderData }: Route.ComponentProps) {
  const { summary, groups } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Conciliación</h1>
        <p className="mt-2 max-w-prose text-pretty text-muted-foreground">
          Los pagos recibidos en la billetera de cada beneficiario se comparan con los comprobantes de la plataforma. Así comprobamos que el dinero fue
          directo de billetera a billetera. Marca como conciliada cada fila que revises y deja una nota.
        </p>
      </header>

      <ReconciliationSummaryView summary={summary} />

      <section aria-labelledby="beneficiaries-heading" className="flex flex-col gap-3">
        <h2 id="beneficiaries-heading" className="text-xl text-primary">
          Pagos por beneficiario
        </h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay pagos para conciliar.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,28rem),1fr))] items-start gap-4">
            {groups.map((group) => (
              <BeneficiaryCard key={group.beneficiaryWallet} group={group} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const detail = error instanceof Response ? null : isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  return (
    <>
      <h1 className="text-2xl text-primary">No pudimos cargar la conciliación</h1>
      <p className="mt-2 text-muted-foreground">Revisa tu conexión y vuelve a intentarlo.</p>
      {detail && <p className="mt-2 text-sm text-destructive">{detail}</p>}
      <a href="" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </a>
    </>
  );
}
