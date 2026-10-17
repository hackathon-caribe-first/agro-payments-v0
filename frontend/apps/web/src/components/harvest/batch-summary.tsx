import { formatKg, type HarvestBatch } from "@agro/shared/modules/harvest/domain/harvest";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { formatDate } from "./format";
import { HarvestStatusBadge } from "./status";
import { MetricsList } from "./metrics-list";

// What a producer declared (and what the verifier certified, once there is a dictamen).
export function BatchSummary({ batch }: { batch: HarvestBatch }) {
  return (
    <section aria-label="Resumen de la cosecha" className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg text-primary">{batch.projectTitle}</h2>
        <HarvestStatusBadge status={batch.status} />
      </div>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Volumen declarado</dt>
          <dd className="font-semibold tabular-nums">{formatKg(batch.declaredKg)}</dd>
        </div>
        {batch.certifiedKg !== null && (
          <div>
            <dt className="text-muted-foreground">Peso certificado</dt>
            <dd className="font-semibold tabular-nums">{formatKg(batch.certifiedKg)}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Precio por kilo</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(batch.askingPricePerKg, batch.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Declarada el</dt>
          <dd className="font-semibold tabular-nums">{formatDate(batch.declaredAt)}</dd>
        </div>
      </dl>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Calidad declarada</h3>
        <MetricsList metrics={batch.qualityMetrics} />
      </div>
      {batch.certifiedMetrics && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Calidad certificada</h3>
          <MetricsList metrics={batch.certifiedMetrics} />
        </div>
      )}
      {batch.notes && <p className="text-sm text-muted-foreground">{batch.notes}</p>}
      {batch.photoUrls.length > 0 && (
        <ul className="flex flex-wrap gap-3 text-sm">
          {batch.photoUrls.map((url, i) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="font-bold text-primary underline underline-offset-4">
                Foto {i + 1}
              </a>
            </li>
          ))}
        </ul>
      )}
      {batch.correctionNotes && (
        <p role="status" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          <span className="font-semibold">✕ Correcciones solicitadas: </span>
          {batch.correctionNotes}
        </p>
      )}
      {batch.certification && (
        <p className="rounded-md bg-muted p-3 text-sm">
          <span className="font-semibold">Dictamen aprobado por {batch.certification.verifierName}</span> el {formatDate(batch.certification.certifiedAt)}. {batch.certification.comments}
          <span className="mt-1 block break-all text-muted-foreground">Firma: {batch.certification.signatureHash}</span>
        </p>
      )}
    </section>
  );
}
