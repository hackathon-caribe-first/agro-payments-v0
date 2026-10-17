import { INVESTOR_IDENTITY } from "../../../presales/infrastructure/mock/identities";
import { z } from "zod";
import { grantDetailDtoSchema, investorGrantsDtoSchema } from "../../../grants/infrastructure/dto";
import { settlementDtoSchema } from "../../../harvest-batches/infrastructure/dto";
import { classify } from "../../domain/reconciliation";
import { reviewBodyDtoSchema, type EntryDto } from "../dto";

// Investor whose grants are reconciled. The grants mock seeds belong to this id.
const SEED_INVESTOR_ID = INVESTOR_IDENTITY.id;

// Seeded anomalies, keyed by the grant idempotency key `milestone:line` (see grants mock seeds).
//  - the transport line of the plantain milestone arrived 10,000 short: DIFERENCIA.
//  - the producer labor payment of the panela milestone has no incoming payment on the read grant: FALTA COMPROBANTE.
const INCOMING_OVERRIDES: Record<string, number | null> = {
  "ms-41:L2": 340000,
  "ms-31:L2": null,
};

// A payment the beneficiary wallet received that the platform never registered: SIN COMPROBANTE.
const UNREGISTERED_INCOMING = {
  id: "rec-incoming-only-1",
  beneficiaryName: "Vivero Llanos del Meta",
  beneficiaryWallet: "https://wallet.example/vivero-meta",
  projectTitle: "Plátano Hartón · Meta",
  amount: 180000,
  incomingPaymentId: "https://wallet.example/vivero-meta/incoming-payments/9d3f0a12-e540",
  occurredAt: "2026-10-14T09:12:00.000Z",
};

const LINE_KIND_LABEL: Record<string, string> = {
  PLATFORM_FEE: "comisión de la plataforma",
  INVESTOR_CAPITAL: "capital del inversor",
  INVESTOR_YIELD: "rendimiento del inversor",
  PRODUCER_NET: "neto del productor",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

interface ReviewRow {
  id: string;
  at: string;
  actor: string;
  note: string;
}

// Mock server of the reconciliation (RF-17). Anchored paths under /reconciliation/**:
//   GET  /reconciliation/entries
//   POST /reconciliation/entries/:id/reviews   { note, actor? }
// The rows are DERIVED on every read from the receipts of the grants (/investors/:id/grants, /grants/:id) and the settlement
// lines (/settlements) reached through `delegate`; only the review notes are state, and they are append-only.
export function createReconciliationMockFetch(delegate: typeof fetch): typeof fetch {
  const reviews = new Map<string, ReviewRow[]>();
  let seq = 0;

  async function read<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S> | null> {
    const response = await delegate(`http://mock.local${path}`);
    if (!response.ok) return null;
    const parsed = schema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data : null;
  }

  async function derive(): Promise<EntryDto[]> {
    const entries: EntryDto[] = [];
    const list = await read(`/investors/${SEED_INVESTOR_ID}/grants`, investorGrantsDtoSchema);
    for (const view of list?.grants ?? []) {
      const detail = await read(`/grants/${encodeURIComponent(view.grant.id)}`, grantDetailDtoSchema);
      for (const r of detail?.receipts ?? []) {
        const incoming = r.idempotency_key in INCOMING_OVERRIDES ? INCOMING_OVERRIDES[r.idempotency_key] : r.received;
        entries.push({
          id: `rec-${r.id}`,
          status: classify(r.received, incoming),
          source: "GRANT_LINE",
          project_id: view.project.id,
          project_title: view.project.title,
          concept: r.concept,
          beneficiary_name: r.beneficiary,
          beneficiary_wallet: r.beneficiary_wallet,
          currency: view.grant.currency,
          receipt_id: r.id,
          outgoing_payment_id: r.outgoing_payment_id,
          receipt_amount: r.received,
          fee: r.fee,
          sent_amount: r.debited,
          incoming_payment_id: incoming === null ? null : r.incoming_payment_id,
          incoming_amount: incoming,
          occurred_at: r.created_at,
          reviews: reviews.get(`rec-${r.id}`) ?? [],
        });
      }
    }

    const settlements = (await read("/settlements", z.array(settlementDtoSchema))) ?? [];
    for (const s of settlements) {
      for (const line of s.lines) {
        if (line.state !== "completado") continue;
        const id = `rec-${line.id}`;
        entries.push({
          id,
          status: classify(line.amount, line.incoming_payment_id ? line.amount : null),
          source: "SETTLEMENT_LINE",
          project_id: s.project_id,
          project_title: s.project_title,
          concept: `Liquidación · ${LINE_KIND_LABEL[line.kind] ?? "Otra línea"}`,
          beneficiary_name: line.beneficiary_name,
          beneficiary_wallet: `https://wallet.example/${slug(line.beneficiary_name)}`,
          currency: s.currency,
          receipt_id: line.receipt_id,
          outgoing_payment_id: line.outgoing_payment_id,
          receipt_amount: line.amount,
          fee: 0,
          sent_amount: line.amount,
          incoming_payment_id: line.incoming_payment_id,
          incoming_amount: line.incoming_payment_id ? line.amount : null,
          occurred_at: line.executed_at ?? s.created_at,
          reviews: reviews.get(id) ?? [],
        });
      }
    }

    const u = UNREGISTERED_INCOMING;
    entries.push({
      id: u.id,
      status: classify(null, u.amount),
      source: "INCOMING_ONLY",
      project_id: null,
      project_title: u.projectTitle,
      concept: "Pago recibido sin línea de pago asociada",
      beneficiary_name: u.beneficiaryName,
      beneficiary_wallet: u.beneficiaryWallet,
      currency: "COP",
      receipt_id: null,
      outgoing_payment_id: null,
      receipt_amount: null,
      fee: 0,
      sent_amount: null,
      incoming_payment_id: u.incomingPaymentId,
      incoming_amount: u.amount,
      occurred_at: u.occurredAt,
      reviews: reviews.get(u.id) ?? [],
    });

    return entries.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    if (method === "GET" && path === "/reconciliation/entries") return json(await derive());

    const review = path.match(/^\/reconciliation\/entries\/([^/]+)\/reviews$/);
    if (method === "POST" && review) {
      const id = decodeURIComponent(review[1]);
      const entry = (await derive()).find((e) => e.id === id);
      if (!entry) return json({ error: "Entry not found" }, 404);
      let raw: unknown;
      try {
        raw = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      } catch {
        raw = undefined;
      }
      const body = reviewBodyDtoSchema.safeParse(raw);
      const note = body.success ? body.data.note.trim() : "";
      if (note.length < 3) return json({ error: "Request rejected", errors: { note: ["Escribe una nota de al menos 3 caracteres."] } }, 400);
      seq += 1;
      const row: ReviewRow = { id: `rev-${String(seq).padStart(4, "0")}`, at: new Date().toISOString(), actor: body.success ? (body.data.actor ?? "Operador") : "Operador", note };
      // Append-only: previous notes are never edited or removed.
      reviews.set(id, [...(reviews.get(id) ?? []), row]);
      return json({ ...entry, reviews: reviews.get(id) }, 201);
    }

    return delegate(input, init);
  };
}
