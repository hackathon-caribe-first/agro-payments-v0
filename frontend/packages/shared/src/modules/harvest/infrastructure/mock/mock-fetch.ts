import type { LedgerEntryDto } from "../../../escrow/infrastructure/dto";
import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { CustodyDto, HarvestEnvelopeDto, PanelDto } from "../dto";

// The slice of the shared mock store the harvest side needs (the same arrays the other handlers use).
export interface HarvestMockStore {
  projects: ProjectDto[];
  milestones: MilestoneDetailDto[];
  ledgerEntries: LedgerEntryDto[];
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rejected = (message: string) => json({ error: "Request rejected", errors: { _form: [message] } }, 409);
const notFound = () => json({ error: "Project not found" }, 404);

type HarvestDto = NonNullable<HarvestEnvelopeDto["harvest"]>;
const BUYER_ID = "buyer-andina";
const DECLARABLE = ["FUNDED_IN_CUSTODY", "IN_EXECUTION"];

// The backend's simulated mode, kept minimal: the buyer pays at once, a fixed price per kg (no contract formula), custody is the
// project's custody_balance minus the executed milestone budgets, and the panel shows no settlement (realized TIR pending).
// Investments and the capture bar come from the investments handler (delegate), so the panel sees the same captures.
export function createHarvestMockFetch(store: HarvestMockStore, delegate: typeof fetch): typeof fetch {
  const harvests = new Map<string, HarvestDto>();
  const envelope = (p: ProjectDto, redirect: string | null = null): HarvestEnvelopeDto => ({
    project_id: p.id,
    project_code: p.project_code,
    project_title: p.title,
    project_status: p.current_status,
    harvest: harvests.get(p.id) ?? null,
    payment_redirect_url: redirect,
  });
  const custodyOf = (p: ProjectDto): CustodyDto => {
    const milestones = store.milestones.filter((m) => m.project_id === p.id);
    const debited = milestones.reduce((sum, m) => sum + m.supplies_executed + m.labor_executed, 0);
    const credits = new Map<string, number>();
    for (const e of store.ledgerEntries.filter((l) => l.project_id === p.id)) credits.set(e.category, (credits.get(e.category) ?? 0) + e.amount);
    return {
      project_id: p.id,
      currency: p.currency,
      balance: Math.max(0, p.custody_balance - debited),
      credited: p.custody_balance,
      credits: [...credits].map(([category, amount]) => ({ category, amount })),
      debited,
      milestone_debits: debited,
      settlement_debits: 0,
    };
  };
  const now = () => new Date().toISOString();

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");
    const body = () => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (method === "GET" && path === "/harvests") {
      return json(store.projects.filter((p) => harvests.has(p.id)).map((p) => envelope(p)));
    }

    const route = path.match(/^\/projects\/([^/]+)\/(harvest|harvest\/certify|harvest\/payment|harvest\/reception|custody)$/);
    const panel = path.match(/^\/investor\/projects\/([^/]+)\/panel$/);
    const projectId = route?.[1] ?? panel?.[1];
    if (!projectId) return delegate(input, init);
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) return notFound();
    const h = harvests.get(project.id);

    if (panel && method === "GET") {
      const [captureRes, investmentsRes] = await Promise.all([delegate(`/api/investor/projects/${project.id}`), delegate(`/api/projects/${project.id}/investments`)]);
      const capture = captureRes.ok ? ((await captureRes.json()) as { capture: PanelDto["capture"] }).capture : null;
      const investments = investmentsRes.ok ? ((await investmentsRes.json()) as Record<string, unknown>[]) : [];
      const dto: PanelDto = {
        project: { id: project.id, project_code: project.project_code, title: project.title, current_status: project.current_status, currency: project.currency },
        capture: capture ?? { target_amount: project.target_amount, raised: 0, progress_pct: 0, investors_count: 0, by_currency: [] },
        custody: custodyOf(project),
        milestones: store.milestones
          .filter((m) => m.project_id === project.id)
          .sort((a, b) => a.sequence_order - b.sequence_order)
          .map((m) => {
            const cap = m.supplies_budget + m.labor_budget;
            const spent = m.supplies_executed + m.labor_executed;
            return { id: m.id, title: m.title, sequence_order: m.sequence_order, status: m.status, grant: { status: spent > 0 ? "active" : "pending", cap, spent, remaining: cap - spent }, lines: [] };
          }),
        my_investments: investments.map((i) => {
          const quote = i.quote as { debit_amount: string; debit_asset_code: string; debit_asset_scale: number; receive_amount: number } | null;
          return {
            id: String(i.id),
            investor_id: String(i.investor_id),
            status: String(i.status),
            amount: Number(i.amount),
            currency: String(i.currency),
            debit: quote && { value: quote.debit_amount, asset_code: quote.debit_asset_code, asset_scale: quote.debit_asset_scale },
            receive_amount: quote?.receive_amount ?? null,
            implied_rate: (i.implied_rate as string | null) ?? null,
            outgoing_payment_id: (i.outgoing_payment_id as string | null) ?? null,
            captured_at: (i.captured_at as string | null) ?? null,
            payouts: [],
          };
        }),
        realized: { status: "pending" },
        median: null,
      };
      return json(dto);
    }

    switch (`${method} ${route?.[2]}`) {
      case "GET harvest":
        return json(envelope(project));
      case "GET custody":
        return json(custodyOf(project));
      case "POST harvest": {
        if (h) return rejected("La cosecha de este proyecto ya se declaró.");
        if (!DECLARABLE.includes(project.current_status)) return rejected("La cosecha se declara con la custodia fondeada y los hitos en ejecución.");
        const b = body();
        harvests.set(project.id, {
          status: "DECLARED",
          declared_quantity_kg: Number(b.quantity_kg),
          declared_quality: String(b.quality_grade),
          evidence: String(b.evidence),
          declared_at: now(),
          certified_quantity_kg: null,
          certified_quality: null,
          certification_notes: null,
          certified_at: null,
          price: null,
          amount_due: null,
          currency: project.currency,
          buyer_id: null,
          payment_reference: null,
          paid_at: null,
          received_at: null,
        });
        project.current_status = "HARVEST_DECLARED";
        return json(envelope(project), 201);
      }
      case "POST harvest/certify": {
        if (h?.status !== "DECLARED") return rejected("Solo se certifica una cosecha declarada.");
        const b = body();
        const price = Number((b.price as { price_per_kg?: number } | undefined)?.price_per_kg ?? 0);
        const quantity = Number(b.certified_quantity_kg);
        Object.assign(h, {
          status: "CERTIFIED",
          certified_quantity_kg: quantity,
          certified_quality: String(b.quality_grade),
          certification_notes: (b.notes as string | null) ?? null,
          certified_at: now(),
          price: { source: "request", price_per_kg: price, exchange_factor: "1/1" },
          amount_due: quantity * price,
        });
        project.current_status = "HARVEST_CERTIFIED";
        return json(envelope(project));
      }
      case "POST harvest/payment": {
        if (h?.status !== "CERTIFIED") return rejected(h ? "La cosecha ya está pagada." : "La cosecha aún no está certificada.");
        const at = now();
        Object.assign(h, { status: "PAID", buyer_id: BUYER_ID, payment_reference: null, paid_at: at });
        store.ledgerEntries.push({
          id: `led-harvest-${project.id}`,
          project_id: project.id,
          type: "CREDIT",
          category: "HARVEST_PAYMENT",
          amount: h.amount_due ?? 0,
          currency: project.currency,
          negotiation_id: "",
          buyer_id: BUYER_ID,
          created_at: at,
        });
        project.custody_balance += h.amount_due ?? 0;
        project.current_status = "MARKET_PAYMENT_HELD";
        return json(envelope(project));
      }
      case "POST harvest/reception": {
        if (h?.status !== "PAID") return rejected("La recepción se confirma después del pago a la custodia.");
        Object.assign(h, { status: "RECEIVED", received_at: now() });
        project.current_status = "DELIVERED_TO_BUYER";
        return json(envelope(project));
      }
      default:
        return delegate(input, init);
    }
  };
}
