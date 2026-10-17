import type { Milestone } from "@agro/shared/api/client";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { ActionForm } from "~/components/action-form";

type Line = Milestone["lines"][number];

const KIND_LABEL: Record<Line["kind"], string> = {
  productor: "Productor",
  proveedor: "Proveedor",
  trabajadores: "Trabajadores",
  plataforma: "Plataforma",
};
const STATUS_LABEL: Record<Line["status"], string> = {
  pendiente: "○ Pendiente",
  en_cola: "◷ En cola",
  completado: "✓ Completado",
  fallido: "✕ Fallido",
};

// `payable` shows the operator's pay button; the producer line waits for approval.
export function Lines({ milestone, payable = false }: { milestone: Milestone; payable?: boolean }) {
  return (
    <table className="w-full text-left">
      <caption className="sr-only">Pagos del hito por beneficiario</caption>
      <thead className="text-sm text-muted-foreground">
        <tr>
          <th className="py-1 font-semibold">Beneficiario</th>
          <th className="py-1 text-right font-semibold">Monto</th>
          <th className="py-1 font-semibold">Estado</th>
          {payable && <th className="py-1 font-semibold">Acción</th>}
        </tr>
      </thead>
      <tbody>
        {milestone.lines.map((l) => (
          <tr key={l.id} className="border-t">
            <td className="py-2">
              {l.beneficiary} <span className="text-sm text-muted-foreground">({KIND_LABEL[l.kind]})</span>
            </td>
            <td className="py-2 text-right tabular-nums">{formatMoney(l.amount, milestone.currency, milestone.assetScale)}</td>
            <td className="py-2">{STATUS_LABEL[l.status]}</td>
            {payable && (
              <td className="py-2">
                {l.status === "pendiente" && !milestone.closedAt && (l.kind !== "productor" || milestone.status === "approved") ? (
                  <ActionForm id={milestone.id} intent="pay-line" label="Pagar">
                    <input type="hidden" name="lineId" value={l.id} />
                  </ActionForm>
                ) : null}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
