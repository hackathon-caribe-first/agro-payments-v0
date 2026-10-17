import { useState } from "react";
import { Form, useNavigation } from "react-router";
import {
  type ContractDocument,
  type InsuranceClaim,
  type InsurancePolicy,
  PARTY_LABELS,
  type PurchaseContract,
} from "@agro/shared/modules/contracts/domain/contracts";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import type { ContractsActionData } from "~/contracts/module";

export type Audience = "producer" | "custodian";

type Props = {
  audience: Audience;
  purchase: PurchaseContract | null;
  policy: InsurancePolicy | null;
  contract: ContractDocument | null;
  claims: InsuranceClaim[];
  actionData: ContractsActionData | undefined;
  /** Whether the project is still before publishing (the purchase contract is editable). */
  beforePublishing: boolean;
};

const cop = (pesos: number) => formatMoney(pesos, "COP");
const number = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const INPUT = "h-11 w-full rounded-md border bg-background px-3 tabular-nums";

function Problem({ data, intent }: { data: ContractsActionData | undefined; intent: string }) {
  if (!data || data.ok || data.intent !== intent) return null;
  return (
    <p role="alert" className="text-sm font-semibold text-destructive">
      ✕ {data.message}
    </p>
  );
}

function Done({ data, intent, text }: { data: ContractsActionData | undefined; intent: string; text: string }) {
  if (!data?.ok || data.intent !== intent) return null;
  return (
    <p role="status" className="text-sm font-semibold text-success">
      ✓ {text}
    </p>
  );
}

function Input({ name, label, data, intent, hint, ...rest }: { name: string; label: string; data: ContractsActionData | undefined; intent: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = data && !data.ok && data.intent === intent ? data.fieldErrors?.[name]?.[0] : undefined;
  const id = `${intent}-${name}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input id={id} name={name} className={INPUT} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...rest} />
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-destructive">
          ✕ {error}
        </p>
      )}
    </div>
  );
}

function Select({ name, label, options, defaultValue, onChange }: { name: string; label: string; options: [string, string][]; defaultValue: string; onChange?: (v: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="font-semibold">{label}</span>
      <select name={name} defaultValue={defaultValue} onChange={(e) => onChange?.(e.target.value)} className="h-11 rounded-md border bg-background px-3">
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
      {rows.map(([term, value]) => (
        <div key={term} className="flex flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">{term}</dt>
          <dd className="break-words font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-lg text-primary">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  );
}

const grid = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3";

function price(c: PurchaseContract) {
  const money = (n: number | null) => (n === null ? "—" : c.currency === "COP" ? cop(n) : `US$ ${number(n)}`);
  return c.priceType === "fixed" ? `${money(c.pricePerUnit)} por ${c.unit}` : `Fórmula sobre ${c.priceReference}: piso ${money(c.floorPerUnit)}, techo ${money(c.ceilingPerUnit)} por ${c.unit}`;
}

function PurchaseSection({ purchase, editable, data, busy }: { purchase: PurchaseContract | null; editable: boolean; data: ContractsActionData | undefined; busy: boolean }) {
  const [type, setType] = useState(purchase?.priceType ?? "fixed");
  const intent = "save-purchase";
  return (
    <Section id="purchase-heading" title="Contrato de compra" intro="El comprador se pacta antes de publicar: precio fijo o fórmula con piso y techo, cantidad, moneda y su wallet. Sin contrato de compra el proyecto no se publica.">
      {purchase ? (
        <>
          <Facts
            rows={[
              ["Precio", price(purchase)],
              ["Cantidad", `${number(purchase.quantity)} ${purchase.unit}`],
              ["Moneda", purchase.currency],
              ["Comprador", purchase.buyerName ? `${purchase.buyerName} · ${purchase.buyerEmail ?? ""}` : (purchase.buyerEmail ?? "—")],
              ["Wallet del comprador", purchase.buyerWalletAddress],
            ]}
          />
          {!purchase.settles && (
            <p className="rounded-md bg-warning px-3 py-2 text-sm font-semibold text-warning-foreground">◷ Contrato en dólares: queda registrado, pero el cobro en USD llega en una fase siguiente.</p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">Este proyecto aún no tiene contrato de compra.</p>
      )}
      {editable && (
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value={intent} />
          <div className={grid}>
            <Select name="price_type" label="Tipo de precio" defaultValue={type} onChange={(v) => setType(v === "formula" ? "formula" : "fixed")} options={[["fixed", "Precio fijo"], ["formula", "Fórmula con piso y techo"]]} />
            {type === "fixed" ? (
              <Input name="price_per_unit" label="Precio por unidad" type="number" min="0" step="0.01" required defaultValue={purchase?.pricePerUnit ?? undefined} data={data} intent={intent} />
            ) : (
              <>
                <Input name="floor_per_unit" label="Piso por unidad" type="number" min="0" step="0.01" required defaultValue={purchase?.floorPerUnit ?? undefined} data={data} intent={intent} />
                <Input name="ceiling_per_unit" label="Techo por unidad" type="number" min="0" step="0.01" required defaultValue={purchase?.ceilingPerUnit ?? undefined} data={data} intent={intent} />
                <Input name="price_reference" label="Referencia de la fórmula" required placeholder="Precio SIPSA Corabastos" defaultValue={purchase?.priceReference ?? undefined} data={data} intent={intent} />
              </>
            )}
            <Input name="quantity" label="Cantidad" type="number" min="1" step="1" required defaultValue={purchase?.quantity} data={data} intent={intent} />
            <Select name="unit" label="Unidad" defaultValue={purchase?.unit ?? "kg"} options={[["kg", "kg"], ["t", "t"]]} />
            <Select name="currency" label="Moneda" defaultValue={purchase?.currency ?? "COP"} options={[["COP", "COP"], ["USD", "USD (exportador)"]]} />
            <Input name="buyer_email" label="Correo del comprador" type="email" required defaultValue={purchase?.buyerEmail ?? undefined} data={data} intent={intent} />
            <Input name="buyer_wallet_address" label="Wallet del comprador" type="url" required placeholder="https://ilp.interledger-test.dev/comprador" defaultValue={purchase?.buyerWalletAddress} data={data} intent={intent} />
          </div>
          <Button type="submit" className="self-start" disabled={busy}>
            {busy ? "Guardando…" : purchase ? "Actualizar contrato de compra" : "Guardar contrato de compra"}
          </Button>
          <Problem data={data} intent={intent} />
          <Done data={data} intent={intent} text="Contrato de compra guardado." />
        </Form>
      )}
    </Section>
  );
}

const PREMIUM_STATE: Record<string, { label: string; tone: "warning" | "success" | "danger" | "neutral"; symbol: string }> = {
  executing: { label: "Pago de la prima en proceso", tone: "warning", symbol: "◷" },
  completed: { label: "Prima pagada desde la custodia", tone: "success", symbol: "✓" },
  failed: { label: "El pago de la prima falló", tone: "danger", symbol: "✕" },
  UNKNOWN: { label: "Estado de la prima desconocido", tone: "neutral", symbol: "?" },
};

function PolicySection({ policy, data, busy }: { policy: InsurancePolicy | null; data: ContractsActionData | undefined; busy: boolean }) {
  const intent = "save-policy";
  const locked = policy?.premiumPayment?.status === "completed" || policy?.premiumPayment?.status === "executing";
  return (
    <Section id="policy-heading" title="Póliza ISA" intro="La aseguradora emite la póliza con beneficiario el patrimonio autónomo. Si el proyecto tiene ficha, la prima y los términos salen de la última simulación.">
      {policy ? (
        <>
          <Facts
            rows={[
              ["Aseguradora", policy.insurerName],
              ["Beneficiario", "Patrimonio autónomo"],
              ["Prima", cop(policy.premium)],
              ["Subsidio ISA", `${number(policy.subsidyPct)} %`],
              ["Prima neta (sale de la custodia)", cop(policy.netPremium)],
              ["Umbral", `${number(policy.thresholdPct)} % · ${number(policy.thresholdYieldKgPerHa)} kg/ha`],
              ["Deducible", `${number(policy.deductiblePct)} %`],
              ["Suma asegurada", cop(policy.sumInsured)],
              ["Índice paramétrico", policy.indexTrigger === null ? "Sin índice" : `disparo ${number(policy.indexTrigger)} · salida ${number(policy.indexExit ?? 0)}`],
              ["Origen", policy.source === "simulation" ? "Última simulación" : "Datos ingresados"],
            ]}
          />
          {policy.premiumPayment && <StatusBadge {...(PREMIUM_STATE[policy.premiumPayment.status] ?? PREMIUM_STATE.UNKNOWN)} />}
        </>
      ) : (
        <p className="text-muted-foreground">Este proyecto aún no tiene póliza registrada.</p>
      )}
      {!locked && (
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value={intent} />
          <div className={grid}>
            <Input name="insurer_name" label="Aseguradora" required defaultValue={policy?.insurerName} data={data} intent={intent} />
            <Input name="insurer_wallet_address" label="Wallet de la aseguradora" type="url" required placeholder="https://ilp.interledger-test.dev/aseguradora" defaultValue={policy?.insurerWalletAddress} data={data} intent={intent} />
            <Input name="premium" label="Prima (COP)" type="number" min="1" step="1" hint="Sin ficha es obligatoria." defaultValue={policy?.source === "input" ? policy.premium : undefined} data={data} intent={intent} />
            <Input name="subsidy_pct" label="Subsidio ISA (%)" type="number" min="0" max="100" step="0.01" defaultValue={policy?.subsidyPct ?? 85} data={data} intent={intent} />
            <Input name="threshold_pct" label="Umbral (% del rendimiento esperado)" type="number" min="1" max="100" step="0.01" defaultValue={policy?.thresholdPct ?? 70} data={data} intent={intent} />
            <Input name="deductible_pct" label="Deducible (%)" type="number" min="0" max="100" step="0.01" defaultValue={policy?.deductiblePct ?? 10} data={data} intent={intent} />
            <Input name="hectares" label="Hectáreas aseguradas" type="number" min="0" step="0.01" defaultValue={policy?.source === "input" ? policy.hectares : undefined} data={data} intent={intent} />
            <Input name="expected_yield_kg_per_ha" label="Rendimiento esperado (kg/ha)" type="number" min="0" step="1" defaultValue={policy?.source === "input" ? policy.expectedYieldKgPerHa : undefined} data={data} intent={intent} />
            <Input name="insured_price_per_kg" label="Precio asegurado (COP por kg)" type="number" min="0" step="0.01" defaultValue={policy?.source === "input" ? policy.insuredPricePerKg : undefined} data={data} intent={intent} />
            <Input name="index_trigger" label="Disparo del índice (opcional)" type="number" step="0.01" defaultValue={policy?.indexTrigger ?? undefined} data={data} intent={intent} />
            <Input name="index_exit" label="Salida del índice (opcional)" type="number" step="0.01" defaultValue={policy?.indexExit ?? undefined} data={data} intent={intent} />
          </div>
          <Button type="submit" variant="secondary" className="self-start" disabled={busy}>
            {busy ? "Guardando…" : policy ? "Actualizar póliza" : "Registrar póliza"}
          </Button>
          <Problem data={data} intent={intent} />
          <Done data={data} intent={intent} text="Póliza guardada." />
        </Form>
      )}
    </Section>
  );
}

function PremiumSection({ policy, data, busy }: { policy: InsurancePolicy | null; data: ContractsActionData | undefined; busy: string | null }) {
  const payment = policy?.premiumPayment ?? null;
  const paid = payment?.status === "completed";
  return (
    <Section id="premium-heading" title="Prima desde la custodia" intro="Al activar el proyecto (captación completa) la fiduciaria aprueba un grant sobre la custodia por la prima neta y se paga a la wallet de la aseguradora.">
      {!policy ? (
        <p className="text-muted-foreground">Registra la póliza para poder pagar la prima.</p>
      ) : paid && payment ? (
        <Facts
          rows={[
            ["Monto pagado", cop(payment.amount)],
            ["Referencia", payment.reference ?? "—"],
            ["Pago saliente", payment.outgoingPaymentId ?? "—"],
            ["Pagada el", payment.completedAt ? new Date(payment.completedAt).toLocaleString("es-CO") : "—"],
          ]}
        />
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <Form method="post">
            <input type="hidden" name="intent" value="premium-grant" />
            <Button type="submit" variant="outline" disabled={busy === "premium-grant"}>
              {busy === "premium-grant" ? "Enviando…" : "Aprobar grant de la prima"}
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="pay-premium" />
            <Button type="submit" disabled={busy === "pay-premium"}>
              {busy === "pay-premium" ? "Pagando…" : payment?.status === "executing" ? "Actualizar pago de la prima" : `Pagar prima neta ${cop(policy.netPremium)}`}
            </Button>
          </Form>
        </div>
      )}
      <Problem data={data} intent="premium-grant" />
      <Done data={data} intent="premium-grant" text="En modo simulado no hay grant que aprobar: puedes pagar la prima." />
      <Problem data={data} intent="pay-premium" />
    </Section>
  );
}

function ClaimsSection({ policy, claims, data, busy }: { policy: InsurancePolicy | null; claims: InsuranceClaim[]; data: ContractsActionData | undefined; busy: string | null }) {
  const inForce = policy?.premiumPayment?.status === "completed";
  return (
    <Section id="claims-heading" title="Indemnización a la custodia" intro="Si el rendimiento cae del umbral o el índice cruza el disparo, la aseguradora paga la indemnización a la custodia. Se confirma cuando el pago llegó.">
      {claims.length > 0 && (
        <ul className="flex flex-col gap-3">
          {claims.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p>
                  {c.trigger === "index" ? "Índice" : "Rendimiento"} observado: <span className="tabular-nums">{number(c.observedValue)}</span>
                  <span className="block font-semibold tabular-nums">Indemnización {cop(c.amount)}</span>
                </p>
                {c.status === "confirmed" ? <StatusBadge label="En custodia" tone="success" symbol="✓" /> : <StatusBadge label="Esperando el pago de la aseguradora" tone="warning" symbol="◷" />}
              </div>
              <p className="text-sm text-muted-foreground">Evidencia: {c.evidence}</p>
              {c.incomingPaymentUrl && <p className="break-all text-sm text-muted-foreground">Pago entrante en la custodia: {c.incomingPaymentUrl}</p>}
              {c.status === "pending" && (
                <Form method="post">
                  <input type="hidden" name="intent" value="confirm-claim" />
                  <input type="hidden" name="claim_id" value={c.id} />
                  <Button type="submit" size="compact" disabled={busy === "confirm-claim"}>
                    {busy === "confirm-claim" ? "Confirmando…" : "Confirmar indemnización recibida"}
                  </Button>
                </Form>
              )}
            </li>
          ))}
        </ul>
      )}
      <Problem data={data} intent="confirm-claim" />
      {inForce && claims.length === 0 && (
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="file-claim" />
          <div className={grid}>
            <Select name="trigger" label="Disparo" defaultValue="yield" options={[["yield", "Rendimiento (kg/ha)"], ["index", "Índice paramétrico"]]} />
            <Input name="observed_value" label="Valor observado" type="number" min="0" step="0.01" required data={data} intent="file-claim" />
            <Input name="evidence" label="Evidencia" required placeholder="Certificado del verificador, acta de cosecha" data={data} intent="file-claim" />
          </div>
          <Button type="submit" variant="secondary" className="self-start" disabled={busy === "file-claim"}>
            {busy === "file-claim" ? "Enviando…" : "Reclamar indemnización"}
          </Button>
          <Problem data={data} intent="file-claim" />
        </Form>
      )}
      {!inForce && <p className="text-muted-foreground">La póliza entra en vigor cuando la prima se paga desde la custodia.</p>}
    </Section>
  );
}

function ContractSection({ contract, canGenerate, data, busy }: { contract: ContractDocument | null; canGenerate: boolean; data: ContractsActionData | undefined; busy: string | null }) {
  return (
    <Section id="contract-heading" title="Contrato del proyecto" intro="Contrato desde plantilla entre inversionistas, patrimonio autónomo, productor y comprador. Cada firma registra quién, como qué parte, cuándo y el hash del texto.">
      {contract ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {contract.status === "signed" ? <StatusBadge label="Firmado por todas las partes" tone="success" symbol="✓" /> : <StatusBadge label="Faltan firmas" tone="warning" symbol="◷" />}
            <span className="text-sm text-muted-foreground tabular-nums">
              Versión {contract.version} · hash {contract.hash.slice(0, 12)}…
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {contract.parties.map((p, i) => (
              <li key={`${p.role}-${i}`} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 last:border-b-0">
                <span>
                  <span className="text-sm text-muted-foreground">{PARTY_LABELS[p.role]}</span> · <span className="font-semibold">{p.name}</span>
                </span>
                {p.signed ? <StatusBadge label="Firmó" tone="success" symbol="✓" /> : <StatusBadge label="Pendiente" tone="neutral" symbol="○" />}
              </li>
            ))}
          </ul>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer font-semibold text-primary">Leer el contrato</summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{contract.body}</pre>
          </details>
          {contract.signableRoles.length > 0 && (
            <Form method="post" className="flex flex-col gap-2">
              <input type="hidden" name="intent" value="sign" />
              <input type="hidden" name="contract_id" value={contract.id} />
              <Button type="submit" className="self-start" disabled={busy === "sign"}>
                {busy === "sign" ? "Firmando…" : `Firmar como ${contract.signableRoles.map((r) => PARTY_LABELS[r].toLowerCase()).join(" y ")}`}
              </Button>
            </Form>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">Aún no se ha generado el contrato. Se genera con el contrato de compra registrado.</p>
      )}
      {canGenerate && (
        <Form method="post">
          <input type="hidden" name="intent" value="generate-contract" />
          <Button type="submit" variant={contract ? "outline" : "secondary"} size={contract ? "compact" : "default"} disabled={busy === "generate-contract"}>
            {busy === "generate-contract" ? "Generando…" : contract ? "Regenerar con los datos actuales" : "Generar contrato"}
          </Button>
        </Form>
      )}
      <Problem data={data} intent="generate-contract" />
      <Problem data={data} intent="sign" />
      <Done data={data} intent="sign" text="Firma registrada." />
    </Section>
  );
}

// RF-04, RF-05, RF-09 for both screens; RF-14 and RF-25 only on the custodian's (the fiduciaria moves custody).
export function ContractsPanel({ audience, purchase, policy, contract, claims, actionData, beforePublishing }: Props) {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle" ? String(navigation.formData?.get("intent") ?? "") : null;
  return (
    <div className="flex flex-col gap-6">
      <p className="self-start rounded-md bg-warning px-2 py-1 text-sm font-semibold text-warning-foreground">Entorno de simulación · Sin dinero real</p>
      <PurchaseSection purchase={purchase} editable={audience === "producer" && beforePublishing} data={actionData} busy={busy === "save-purchase"} />
      <PolicySection policy={policy} data={actionData} busy={busy === "save-policy"} />
      {audience === "custodian" && <PremiumSection policy={policy} data={actionData} busy={busy} />}
      {audience === "custodian" && <ClaimsSection policy={policy} claims={claims} data={actionData} busy={busy} />}
      <ContractSection contract={contract} canGenerate={purchase !== null} data={actionData} busy={busy} />
    </div>
  );
}
