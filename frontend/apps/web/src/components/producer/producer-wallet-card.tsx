import type { Project } from "@agro/shared/modules/projects/domain/project";
import { formatBps } from "@agro/shared/modules/payment-lines/domain/money";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";

// RF-01 / RF-21: where the producer is paid and how much of each milestone is kept as a contingency fund.
export function ProducerWalletCard({ project }: { project: Pick<Project, "producerWallet" | "contingencyBps"> }) {
  const reserve = project.contingencyBps ?? 0;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base text-primary">Billetera del productor</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 text-sm">
        {project.producerWallet ? (
          <p className="break-all font-semibold">{project.producerWallet.replace(/^https:\/\//, "")}</p>
        ) : (
          <p className="text-muted-foreground">Este proyecto usa la billetera del perfil del productor.</p>
        )}
        <dl className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Fondo de imprevistos</dt>
          <dd className="font-semibold tabular-nums">{reserve > 0 ? `${formatBps(reserve)} de cada hito` : "Sin fondo"}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
