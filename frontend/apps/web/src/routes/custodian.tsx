import { useSearchParams } from "react-router";
import type { Milestone } from "@agro/shared/api/client";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import { ActionForm } from "~/components/action-form";
import { MilestoneCard, MilestoneList } from "~/components/milestone-card";
import { Lines } from "~/components/shares";
import { loadMilestones, milestoneAction } from "~/milestones";
import type { Route } from "./+types/custodian";

export const meta = () => [{ title: "Pagos · Surco" }];
export const clientLoader = () => loadMilestones();
export const clientAction = ({ request }: Route.ClientActionArgs) => milestoneAction(request);

// The wallet sends the browser back here with ?funded=<id> or ?funding_error=<id>.
function FundingResult({ milestones }: { milestones: Milestone[] }) {
  const [params] = useSearchParams();
  const title = (id: string | null) => milestones.find((m) => m.id === id)?.title ?? "el hito";
  if (params.has("funded")) {
    return (
      <p role="status" className="mt-4 rounded-md bg-secondary px-4 py-3 font-semibold text-primary">
        ✓ Fondeo aprobado para «{title(params.get("funded"))}». Ya puedes pagar sus líneas.
      </p>
    );
  }
  if (params.has("funding_error")) {
    return (
      <p role="alert" className="mt-4 rounded-md border border-destructive bg-card px-4 py-3 font-semibold text-destructive">
        ✕ No se completó el fondeo de «{title(params.get("funding_error"))}». El inversionista no aprobó el permiso en su billetera
        o no pudimos verificarlo. Intenta fondear de nuevo.
      </p>
    );
  }
  return null;
}

export default function Custodian({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Pagos</h1>
        <p className="mt-2 text-muted-foreground">
          Fondea cada hito: el inversionista aprueba en su billetera un solo permiso de pago por el monto del hito. Después paga a
          proveedores y trabajadores durante la ejecución. La línea del productor se libera sola cuando el verificador aprueba.
        </p>
      </header>
      <FundingResult milestones={loaderData} />
      <MilestoneList>
        {loaderData.map((m) => (
          <MilestoneCard key={m.id} milestone={m}>
            <div className="flex flex-col gap-4">
              {m.fundedAt ? (
                <StatusBadge label="Fondeado" tone="success" symbol="✓" />
              ) : (
                <div className="flex flex-col gap-3">
                  <StatusBadge label="Sin fondeo" tone="neutral" symbol="○" />
                  {!m.closedAt && <ActionForm id={m.id} intent="fund" label="Fondear hito" />}
                </div>
              )}
              <Lines milestone={m} payable={Boolean(m.fundedAt)} receipts />
              {m.lines.some((l) => l.status === "en_cola") && (
                <ActionForm id={m.id} intent="sync" label="Actualizar pagos en cola" variant="outline" />
              )}
            </div>
          </MilestoneCard>
        ))}
      </MilestoneList>
    </div>
  );
}
