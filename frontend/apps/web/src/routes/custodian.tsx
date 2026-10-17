import { ScrollText } from "lucide-react";
import { Form, Link, redirect, useSearchParams } from "react-router";
import type { Milestone } from "@agro/shared/api/client";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { StatusBadge } from "@agro/shared/ui/status-badge";
import type { Custody } from "@agro/shared/modules/harvest/domain/harvest";
import { ActionForm } from "~/components/action-form";
import { CustodyCard } from "~/components/harvest/custody-card";
import { harvest } from "~/harvest/module";
import { milestones as projectMilestones } from "~/producer/module";
import { MilestoneCard, MilestoneList } from "~/components/milestone-card";
import { Lines } from "~/components/shares";
import { loadMilestones } from "~/milestones";
import { custodianAction, loadOrders, loadSuppliers, type Order, type Supplier } from "~/payouts";
import type { Route } from "./+types/custodian";

export const meta = () => [{ title: "Pagos · Surco" }];
export async function clientLoader() {
  const milestones = await loadMilestones();
  const [orders, suppliers, custody] = await Promise.all([loadOrders(milestones), loadSuppliers(), observedCustody(milestones)]);
  return { milestones, orders, suppliers, custody };
}

// RF-21: an observed milestone pays nothing more, so the operator sees what stays in its project's custody. The legacy milestone
// shape has no project, so its PRD detail gives it. Best effort: a failed read just hides the card.
async function observedCustody(milestones: Milestone[]): Promise<Record<string, Custody>> {
  const entries = await Promise.all(
    milestones
      .filter((m) => m.status === "observado")
      .map(async (m): Promise<[string, Custody] | null> => {
        const detail = await projectMilestones.getMilestoneDetail(m.id);
        if (!detail.ok) return null;
        const custody = await harvest.custody(detail.value.projectId);
        return custody.ok ? [m.id, custody.value] : null;
      }),
  );
  return Object.fromEntries(entries.filter((e): e is [string, Custody] => e !== null));
}
export async function clientAction({ request }: Route.ClientActionArgs) {
  const form = await request.clone().formData();
  const projectId = String(form.get("projectId") ?? "").trim();
  if (form.get("intent") === "open-project" && projectId) return redirect(`/custodian/projects/${encodeURIComponent(projectId)}`);
  return custodianAction(request);
}

// The custody wallet sends the browser back here with ?funded=<id> / ?funding_error=<id> (milestone grant)
// or ?liquidation_granted=<id> / ?liquidation_error=<id> (settlement liquidation grant).
function GrantResult({ milestones }: { milestones: Milestone[] }) {
  const [params] = useSearchParams();
  const title = (id: string | null) => milestones.find((m) => m.id === id)?.title ?? "el hito";
  const ok = (text: string) => (
    <p role="status" className="mt-4 rounded-md bg-secondary px-4 py-3 font-semibold text-primary">
      ✓ {text}
    </p>
  );
  const fail = (text: string) => (
    <p role="alert" className="mt-4 rounded-md border border-destructive bg-card px-4 py-3 font-semibold text-destructive">
      ✕ {text}
    </p>
  );
  if (params.has("funded")) return ok(`Grant aprobado para «${title(params.get("funded"))}». Ya puedes pagar sus líneas desde la custodia.`);
  if (params.has("funding_error")) {
    return fail(
      `No se completó el grant de «${title(params.get("funding_error"))}». La fiduciaria no lo aprobó en la billetera de custodia o no pudimos verificarlo. Intenta de nuevo.`,
    );
  }
  if (params.has("liquidation_granted")) return ok("Grant de liquidación aprobado. Ya puedes ejecutar la cascada.");
  if (params.has("premium_granted")) return ok("Grant de la prima aprobado. Ya puedes pagar la prima neta desde la custodia.");
  if (params.has("premium_error")) return fail("No se completó el grant de la prima. Intenta aprobarlo de nuevo.");
  if (params.has("liquidation_error")) return fail("No se completó el grant de liquidación. Intenta aprobarlo de nuevo.");
  return null;
}

// RF-13 / RF-22: none → live (funded, open) → revoked (closed after approval).
function GrantStatus({ milestone: m }: { milestone: Milestone }) {
  if (m.closedAt) return <StatusBadge label="Grant revocado" tone="neutral" symbol="■" />;
  if (m.fundedAt) return <StatusBadge label="Grant vivo" tone="success" symbol="✓" />;
  return <StatusBadge label="Sin grant" tone="neutral" symbol="○" />;
}

const ORDER_STATE: Record<Order["approval"], { label: string; tone: "warning" | "success" | "danger"; symbol: string }> = {
  pending: { label: "Por aprobar", tone: "warning", symbol: "◷" },
  approved: { label: "Aprobada", tone: "success", symbol: "✓" },
  rejected: { label: "Rechazada", tone: "danger", symbol: "✕" },
};

function Orders({ milestone, orders, suppliers }: { milestone: Milestone; orders: Order[]; suppliers: Supplier[] }) {
  if (orders.length === 0) return null;
  const pesos = (value: number) => formatMoney(value, milestone.currency);
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-semibold text-primary">Órdenes de compra del productor</h3>
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-col gap-3 rounded-md border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p>
                {o.quantity} {o.unit} de {o.product} a <strong>{o.supplier}</strong>
                <span className="block text-sm text-muted-foreground tabular-nums">
                  {pesos(o.unit_price)} c/u · total {pesos(o.total)}
                </span>
              </p>
              <StatusBadge {...ORDER_STATE[o.approval]} />
            </div>
            {o.approval === "rejected" && o.reason && <p className="text-sm text-muted-foreground">Motivo: {o.reason}</p>}
            {o.approval === "pending" && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-4">
                <ActionForm id={milestone.id} intent="approve-order" label="Aprobar orden">
                  <input type="hidden" name="orderId" value={o.id} />
                  {suppliers.length > 0 && (
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-semibold">Proveedor registrado</span>
                      <select name="supplierId" defaultValue="" className="h-9 rounded-md border border-input bg-card px-2">
                        <option value="">El que dictó el productor</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </ActionForm>
                <ActionForm id={milestone.id} intent="reject-order" label="Rechazar" variant="outline">
                  <input type="hidden" name="orderId" value={o.id} />
                </ActionForm>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// RF-14 / RF-25: the premium and indemnity live on the project's page. The wallet callback names the project in its query.
function PremiumGrantLink() {
  const [params] = useSearchParams();
  const projectId = params.get("premium_granted") ?? params.get("premium_error");
  if (!projectId) return null;
  return (
    <a href={`/custodian/projects/${encodeURIComponent(projectId)}`} className="self-start font-brand font-bold text-primary underline underline-offset-4">
      Ir al seguro del proyecto
    </a>
  );
}

function OpenProject() {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <h2 className="text-lg text-primary">Seguro y contrato de un proyecto</h2>
      <p className="text-sm text-muted-foreground">Prima neta desde la custodia, indemnizaciones de la aseguradora y la firma del patrimonio autónomo.</p>
      <Form method="post" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="intent" value="open-project" />
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
          <span className="font-semibold">Identificador del proyecto</span>
          <Input name="projectId" required placeholder="p-…" />
        </label>
        <button type="submit" className="h-11 rounded-md border px-5 font-brand font-bold text-primary">
          Abrir
        </button>
      </Form>
    </section>
  );
}

function RegisterSupplier({ suppliers }: { suppliers: Supplier[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <h2 className="text-lg text-primary">Proveedores</h2>
      <p className="text-sm text-muted-foreground">
        Una orden solo se aprueba si su proveedor está registrado con una billetera en pesos (COP).
        {suppliers.length > 0 && ` Registrados: ${suppliers.map((s) => s.name).join(", ")}.`}
      </p>
      <ActionForm id="" intent="register-supplier" label="Registrar proveedor" variant="outline">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Nombre</span>
            <Input name="name" required minLength={2} placeholder="Almacén Don Pedro" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Billetera</span>
            <Input name="walletAddress" type="url" required placeholder="https://ilp.interledger-test.dev/proveedor" />
          </label>
        </div>
      </ActionForm>
    </section>
  );
}

export default function Custodian({ loaderData }: Route.ComponentProps) {
  const { milestones, orders, suppliers, custody } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">Pagos desde la custodia</h1>
        <p className="mt-2 text-muted-foreground">
          La fiduciaria aprueba un grant por hito en la billetera de custodia, con tope igual al presupuesto del hito, y uno a la vez por
          proyecto. Con el grant vivo se aprueban las órdenes del productor y se paga a los proveedores. Los jornales y el fee se pagan
          solos cuando el verificador aprueba; al cerrar el hito el grant se revoca.
        </p>
        <Button asChild variant="outline" size="compact" className="mt-3">
          <Link to="/custodian/traces">
            <ScrollText aria-hidden="true" />
            Traza de Open Payments
          </Link>
        </Button>
      </header>
      <GrantResult milestones={milestones} />
      <PremiumGrantLink />
      <OpenProject />
      <RegisterSupplier suppliers={suppliers} />
      <MilestoneList>
        {milestones.map((m) => (
          <MilestoneCard key={m.id} milestone={m}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <GrantStatus milestone={m} />
                {!m.fundedAt && !m.closedAt && <ActionForm id={m.id} intent="fund" label="Aprobar grant del hito" />}
              </div>
              {custody[m.id] && <CustodyCard custody={custody[m.id]} note="Hito observado: el grant sigue vivo, sin jornales ni hito siguiente. Este es el saldo que sigue en custodia." />}
              <Orders milestone={m} orders={orders[m.id] ?? []} suppliers={suppliers} />
              <Lines milestone={m} payable={Boolean(m.fundedAt)} receipts />
              {m.lines.some((l) => l.status === "en_cola") && (
                <ActionForm id={m.id} intent="sync" label="Actualizar pagos en cola" variant="outline" />
              )}
            </div>
          </MilestoneCard>
        ))}
      </MilestoneList>
    </div>
  );
}
