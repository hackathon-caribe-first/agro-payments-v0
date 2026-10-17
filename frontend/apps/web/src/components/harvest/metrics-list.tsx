import { metricLabel, type QualityMetrics } from "@agro/shared/modules/harvest/domain/harvest";

// The quality payload is dynamic JSON: render whatever keys it carries.
export function MetricsList({ metrics }: { metrics: QualityMetrics }) {
  const entries = Object.entries(metrics);
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Sin métricas de calidad reportadas.</p>;
  return (
    <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-3 text-sm">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-muted-foreground">{metricLabel(key)}</dt>
          <dd className="font-semibold tabular-nums">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
