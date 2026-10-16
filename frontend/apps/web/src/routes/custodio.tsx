import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { ActionForm } from "~/components/action-form";
import { MilestoneCard, MilestoneList } from "~/components/milestone-card";
import { Shares } from "~/components/shares";
import { loadMilestones, milestoneAction } from "~/milestones";
import type { Route } from "./+types/custodio";

export const meta = () => [{ title: "Pagos · Surco" }];
export const clientLoader = () => loadMilestones();
export const clientAction = ({ request }: Route.ClientActionArgs) => milestoneAction(request);

export default function Custodio({ loaderData }: Route.ComponentProps) {
  const payable = loaderData.filter((m) => m.status === "approved");

  return (
    <>
      <h1 className="text-3xl text-primary">Pagos</h1>
      <p className="mt-2 text-muted-foreground">
        Cada hito aprobado se reparte 50 % productor, 30 % proveedor y 20 % trabajadores.
      </p>
      {payable.length === 0 && (
        <p className="mt-6 rounded-lg border bg-card p-5 text-muted-foreground">
          Aún no hay hitos aprobados. Aparecerán aquí cuando el verificador apruebe uno.
        </p>
      )}
      <MilestoneList>
        {payable.map((m) => (
          <MilestoneCard key={m.id} milestone={m}>
            {!m.payment && <ActionForm id={m.id} intent="pay" label="Ordenar pago simulado" />}
            {m.payment && (
              <div className="flex flex-col gap-4">
                <p>
                  Se simuló un pago de {formatMoney(m.amount, m.currency)}; no se transfirió dinero.
                </p>
                <Shares payment={m.payment} currency={m.currency} />
                {m.payment.status === "processing" && (
                  <ActionForm id={m.id} intent="confirm" label="Confirmar recepción" />
                )}
              </div>
            )}
          </MilestoneCard>
        ))}
      </MilestoneList>
    </>
  );
}
