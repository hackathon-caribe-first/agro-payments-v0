import type { BeneficiaryGroup } from "@agro/shared/modules/reconciliation/domain/reconciliation";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { EntryRow } from "./entry-row";

// All the payments a beneficiary wallet received, anomalies of the group first.
export function BeneficiaryCard({ group }: { group: BeneficiaryGroup }) {
  const anomalies = group.entries.filter((e) => e.status !== "CUADRA").length;
  return (
    <li className="min-w-0">
      <Card>
        <CardHeader>
          <CardTitle className="break-words text-lg text-primary">{group.beneficiaryName}</CardTitle>
          <p className="break-all text-sm text-muted-foreground">{group.beneficiaryWallet}</p>
          <p className="text-sm font-semibold">
            {anomalies === 0 ? "Todos los pagos cuadran" : anomalies === 1 ? "1 pago por revisar" : `${anomalies} pagos por revisar`}
          </p>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col">
            {group.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </li>
  );
}
