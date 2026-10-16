import type { Milestone } from "@agro/shared/api/client";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";

const RECIPIENT_LABEL = { productor: "Productor", proveedor: "Proveedor", trabajadores: "Trabajadores" };

export function Shares({ payment, currency }: { payment: NonNullable<Milestone["payment"]>; currency: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        Referencia de simulación <span className="font-semibold text-foreground">{payment.reference}</span>
      </p>
      <table className="w-full text-left">
        <caption className="sr-only">Distribución del pago simulado</caption>
        <thead className="text-sm text-muted-foreground">
          <tr>
            <th className="py-1 font-semibold">Destinatario</th>
            <th className="py-1 text-right font-semibold">%</th>
            <th className="py-1 text-right font-semibold">Monto</th>
          </tr>
        </thead>
        <tbody>
          {payment.shares.map((s) => (
            <tr key={s.recipient} className="border-t">
              <td className="py-2">{RECIPIENT_LABEL[s.recipient]}</td>
              <td className="py-2 text-right tabular-nums">{s.percent} %</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(s.amount, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
