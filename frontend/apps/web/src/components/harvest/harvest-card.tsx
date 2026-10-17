import { useFetcher } from "react-router";
import type { Harvest } from "@agro/shared/modules/harvest/domain/harvest";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { formatMoney, type Tone } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import { Textarea } from "@agro/shared/ui/textarea";
import { formatDateTime } from "~/components/presale/format";
import type { HarvestActionData } from "~/harvest/module";

// Payment held ≠ goods received: separate states, and no green check until the buyer confirmed reception.
const STATUS: Record<string, { label: string; tone: Tone; symbol: string }> = {
  DECLARED: { label: "Declarada · por certificar", tone: "warning", symbol: "◷" },
  CERTIFIED: { label: "Certificada · por pagar", tone: "warning", symbol: "◷" },
  PAID: { label: "Pago en custodia · por recibir", tone: "warning", symbol: "◷" },
  RECEIVED: { label: "Recibida por el comprador", tone: "success", symbol: "✓" },
};

export function HarvestStatusBadge({ status }: { status: string }) {
  return <StatusBadge {...(STATUS[status] ?? { label: "Estado desconocido", tone: "neutral", symbol: "○" })} />;
}

const kg = (n: number) => `${n.toLocaleString("es-CO")} kg`;

/** RF-24: what was declared, certified and paid. */
export function HarvestFacts({ harvest: h }: { harvest: Harvest }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3 text-sm">
      <div>
        <dt className="text-muted-foreground">Declarado por el productor</dt>
        <dd className="tabular-nums">
          {kg(h.declaredQuantityKg)} · {h.declaredQuality}
        </dd>
      </div>
      {h.certifiedQuantityKg !== null && (
        <div>
          <dt className="text-muted-foreground">Certificado (Q y calidad)</dt>
          <dd className="tabular-nums">
            {kg(h.certifiedQuantityKg)} · {h.certifiedQuality}
          </dd>
        </div>
      )}
      {h.price && (
        <div>
          <dt className="text-muted-foreground">Precio por kilo ({h.price.source === "contract" ? "contrato" : "certificación"})</dt>
          <dd className="tabular-nums">{formatMoney(h.price.pricePerKg, h.currency)}</dd>
        </div>
      )}
      {h.amountDue !== null && (
        <div>
          <dt className="text-muted-foreground">Orden Q × P</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(h.amountDue, h.currency)}</dd>
        </div>
      )}
      {h.paidAt && (
        <div>
          <dt className="text-muted-foreground">Pagado a la custodia</dt>
          <dd className="tabular-nums">{formatDateTime(h.paidAt)}</dd>
        </div>
      )}
      {h.receivedAt && (
        <div>
          <dt className="text-muted-foreground">Recepción confirmada</dt>
          <dd className="tabular-nums">{formatDateTime(h.receivedAt)}</dd>
        </div>
      )}
    </dl>
  );
}

type FieldSpec = { name: string; errorKey: string; label: string; hint?: string; numeric?: boolean; multiline?: boolean };

/** One harvest step: hidden intent + project, its fields with errors under each, and a pending state that never claims success early. */
export function HarvestStepForm({ projectId, intent, label, fields = [] }: { projectId: string; intent: string; label: string; fields?: FieldSpec[] }) {
  const fetcher = useFetcher<HarvestActionData>();
  const pending = fetcher.state !== "idle";
  const errors = fetcher.data && !fetcher.data.ok ? fetcher.data.fieldErrors : {};
  return (
    <fetcher.Form method="post" noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="projectId" value={projectId} />
      {fields.map((f) => {
        const id = `${intent}-${f.name}`;
        const messages = errors[f.errorKey];
        const aria = { "aria-invalid": messages ? true : undefined, "aria-describedby": messages ? `${id}-error` : undefined };
        return (
          <div key={f.name} className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{f.label}</Label>
            {f.multiline ? <Textarea id={id} name={f.name} {...aria} /> : <Input id={id} name={f.name} inputMode={f.numeric ? "numeric" : undefined} autoComplete="off" {...aria} />}
            {f.hint && <p className="text-sm text-muted-foreground">{f.hint}</p>}
            {messages && (
              <p id={`${id}-error`} className="text-sm font-semibold text-destructive">
                ✕ {messages.join(" ")}
              </p>
            )}
          </div>
        );
      })}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Enviando…" : label}
      </Button>
      {errors[FORM_LEVEL_KEY] && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          ✕ {errors[FORM_LEVEL_KEY].join(" ")}
        </p>
      )}
    </fetcher.Form>
  );
}

export function HarvestCard({ title = "Cosecha", harvest, children }: { title?: string; harvest: Harvest | null; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-lg text-primary">{title}</CardTitle>
        {harvest && <HarvestStatusBadge status={harvest.status} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {harvest && <HarvestFacts harvest={harvest} />}
        {children}
        <p className="text-sm text-muted-foreground">Entorno de simulación · Sin dinero real</p>
      </CardContent>
    </Card>
  );
}
