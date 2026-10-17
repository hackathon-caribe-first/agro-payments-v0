import type { Supplier } from "@agro/shared/modules/payment-lines/domain/supplier";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { CATEGORY_LABELS, shortWallet } from "./copy";
import { SupplierStatusBadge } from "./line-status-badge";

export function SupplierList({ suppliers }: { suppliers: Supplier[] }) {
  if (suppliers.length === 0) {
    return <p className="rounded-lg border bg-card p-5 text-muted-foreground">Aún no tienes proveedores. Registra el primero con el formulario.</p>;
  }
  return (
    <ul className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
      {suppliers.map((s) => (
        <li key={s.id}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{CATEGORY_LABELS[s.category]}</p>
                  <CardTitle className="break-words text-lg text-primary">{s.name}</CardTitle>
                </div>
                <SupplierStatusBadge status={s.status} />
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Billetera</dt>
                  <dd className="break-all font-semibold">{shortWallet(s.walletAddress)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <div>
                    <dt className="text-muted-foreground">Nombre público</dt>
                    <dd className="font-semibold">{s.publicName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Moneda</dt>
                    <dd className="font-semibold">{s.assetCode}</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
