import { VERIFIER_IDENTITY } from "../../../presales/infrastructure/mock/identities";
import type { HarvestBatchDto, OrderDto, SettlementDto } from "../dto";
import { buildSettlement } from "./settle";

export const PRODUCER = { id: "producer-main", name: "Agrícola La Esperanza S.A.S." } as const;
export const BUYER = { id: "buyer-andina", name: "Comercializadora Andina S.A.S." } as const;
export const VERIFIER = { id: VERIFIER_IDENTITY.id, name: VERIFIER_IDENTITY.label } as const;

// Investment terms per project. The investments module belongs to another workstream, so the capital and the agreed
// yield are seeded here; projects not listed fall back to the project's target amount and investor_roi_pct.
export const INVESTMENT_TERMS: Record<string, { capital: number; yieldPct: number }> = {
  "proj-aguacate-tolima": { capital: 24_000_000, yieldPct: 12 },
  "proj-platano-meta": { capital: 4_000_000, yieldPct: 10 },
  "ext-tolima-cacao": { capital: 14_000_000, yieldPct: 16 },
  "ext-sierra-cafe": { capital: 28_000_000, yieldPct: 14 },
  "proj-panela-cundinamarca": { capital: 19_500_000, yieldPct: 11 },
};

export interface HarvestState {
  batches: HarvestBatchDto[];
  orders: OrderDto[];
  settlements: SettlementDto[];
  next: (prefix: string) => string;
}

const batch = (o: Partial<HarvestBatchDto> & Pick<HarvestBatchDto, "id" | "project_id" | "project_title" | "production_type">): HarvestBatchDto => {
  const terms = INVESTMENT_TERMS[o.project_id] ?? { capital: 0, yieldPct: 0 };
  const yieldDue = Math.floor((terms.capital * terms.yieldPct) / 100);
  return {
    producer_id: PRODUCER.id,
    producer_name: PRODUCER.name,
    status: "CERTIFIED_LISTED",
    declared_kg: 0,
    certified_kg: null,
    asking_price_per_kg: 0,
    available_kg: 0,
    has_open_order: false,
    currency: "COP",
    quality_metrics: {},
    certified_metrics: null,
    notes: "",
    photo_urls: [],
    declared_at: "2026-09-20T15:00:00.000Z",
    correction_notes: null,
    certification: null,
    investor_capital: terms.capital,
    investor_yield_pct: terms.yieldPct,
    capital_outstanding: terms.capital,
    yield_outstanding: yieldDue,
    ...o,
  };
};

const certification = (hash: string, comments: string, at: string) => ({
  verifier_name: VERIFIER.name,
  comments,
  signature_hash: hash,
  certified_at: at,
});

const order = (o: Partial<OrderDto> & Pick<OrderDto, "id" | "batch_id" | "project_id" | "project_title" | "production_type" | "quantity_kg" | "unit_price" | "status">): OrderDto => {
  const total = o.quantity_kg * o.unit_price;
  const terms = INVESTMENT_TERMS[o.project_id] ?? { capital: 0, yieldPct: 0 };
  return {
    buyer_id: BUYER.id,
    buyer_name: BUYER.name,
    producer_id: PRODUCER.id,
    producer_name: PRODUCER.name,
    total,
    currency: "COP",
    grant: { state: "NONE", cap: total, approved_at: null, revoked_at: null, revocation_proof: null },
    dispatch: null,
    received_at: null,
    created_at: "2026-10-02T14:00:00.000Z",
    events: [],
    capital_due: terms.capital,
    yield_due: Math.floor((terms.capital * terms.yieldPct) / 100),
    platform_fee_bp: 200,
    ...o,
  };
};

export function createHarvestState(): HarvestState {
  let seq = 2000;
  const next = (prefix: string) => `${prefix}-${++seq}`;

  const batches: HarvestBatchDto[] = [
    // Fully sold and settled (the happy-path example).
    batch({
      id: "hb-1001",
      project_id: "proj-aguacate-tolima",
      project_title: "Aguacate Hass · Chaparral",
      production_type: "Aguacate",
      status: "SOLD_OUT",
      declared_kg: 8200,
      certified_kg: 8000,
      asking_price_per_kg: 4000,
      quality_metrics: { humidity_pct: 78, score: 90, certification: "GlobalG.A.P." },
      certified_metrics: { humidity_pct: 77.5, score: 88, certification: "GlobalG.A.P." },
      notes: "Cosecha selectiva en dos pases.",
      declared_at: "2026-06-12T15:00:00.000Z",
      certification: certification("sig-4f2a9c71e0b3", "Calibre y madurez conformes.", "2026-06-15T16:00:00.000Z"),
      capital_outstanding: 0,
      yield_outstanding: 0,
    }),
    // Listed lot with an order already authorized, waiting for dispatch.
    batch({
      id: "hb-1002",
      project_id: "proj-platano-meta",
      project_title: "Plátano Hartón · Granada",
      production_type: "Plátano",
      declared_kg: 2600,
      certified_kg: 2500,
      asking_price_per_kg: 3000,
      quality_metrics: { humidity_pct: 82, score: 86 },
      certified_metrics: { humidity_pct: 81.5, score: 85 },
      declared_at: "2026-09-25T15:00:00.000Z",
      certification: certification("sig-9b1d33a8c5e2", "Fruta sana, tamaño y madurez adecuados.", "2026-09-28T16:00:00.000Z"),
    }),
    // Loss scenario: the sale (12 M) does not cover capital + yield (16.24 M).
    batch({
      id: "hb-1003",
      project_id: "ext-tolima-cacao",
      project_title: "Cacao fino · Tolima",
      production_type: "Cacao",
      declared_kg: 1050,
      certified_kg: 1000,
      asking_price_per_kg: 12000,
      quality_metrics: { humidity_pct: 7, score: 82, certification: "Orgánico" },
      certified_metrics: { humidity_pct: 7, score: 80, certification: "Orgánico" },
      declared_at: "2026-09-18T15:00:00.000Z",
      certification: certification("sig-e03c7a5d1f94", "Fermentación completa; rendimiento menor al estimado.", "2026-09-21T16:00:00.000Z"),
    }),
    // Free lot on the marketplace.
    batch({
      id: "hb-1004",
      project_id: "ext-sierra-cafe",
      project_title: "Café de altura · Sierra Nevada",
      production_type: "Café",
      declared_kg: 3100,
      certified_kg: 3000,
      asking_price_per_kg: 18000,
      quality_metrics: { humidity_pct: 11, score: 87, certification: "Rainforest Alliance" },
      certified_metrics: { humidity_pct: 10.8, score: 86, certification: "Rainforest Alliance" },
      notes: "Café pergamino seco, lote único.",
      photo_urls: ["https://images.example.com/harvest/cafe-lote-1.jpg"],
      declared_at: "2026-10-01T15:00:00.000Z",
      certification: certification("sig-72c8be0a3d19", "Taza limpia, sin defectos primarios.", "2026-10-04T16:00:00.000Z"),
    }),
    // Waiting in the verifier queue (real project already in HARVEST_DECLARED).
    batch({
      id: "hb-1005",
      project_id: "proj-panela-cundinamarca",
      project_title: "Panela orgánica · Útica",
      production_type: "Caña panelera",
      status: "DECLARED_BY_PRODUCER",
      declared_kg: 6000,
      asking_price_per_kg: 4500,
      quality_metrics: { humidity_pct: 9, score: 84, certification: "Orgánico" },
      notes: "Panela en bloque de 500 g.",
      declared_at: "2026-10-12T15:00:00.000Z",
    }),
  ];

  const orders: OrderDto[] = [
    order({
      id: "ord-1001",
      batch_id: "hb-1001",
      project_id: "proj-aguacate-tolima",
      project_title: "Aguacate Hass · Chaparral",
      production_type: "Aguacate",
      quantity_kg: 8000,
      unit_price: 4000,
      status: "SETTLED",
      created_at: "2026-06-18T14:00:00.000Z",
      grant: { state: "REVOKED_AFTER_SETTLEMENT", cap: 32_000_000, approved_at: "2026-06-18T15:00:00.000Z", revoked_at: "2026-06-30T17:00:00.000Z", revocation_proof: "Autorización cerrada: tope COP 32.000.000, gastado COP 32.000.000." },
      dispatch: { tracking_number: "GU-884201", carrier: "Servientrega", photo_url: "https://images.example.com/dispatch/gu-884201.jpg", dispatched_at:"2026-06-22T13:00:00.000Z" },
      received_at: "2026-06-30T16:00:00.000Z",
      events: [
        { status: "AWAITING_PAYMENT_AUTHORIZATION", at: "2026-06-18T14:00:00.000Z" },
        { status: "PAYMENT_AUTHORIZED", at: "2026-06-18T15:00:00.000Z" },
        { status: "DISPATCHED", at: "2026-06-22T13:00:00.000Z" },
        { status: "RECEIVED_CONFIRMED", at: "2026-06-30T16:00:00.000Z" },
        { status: "SETTLED", at: "2026-06-30T17:00:00.000Z" },
      ],
      capital_due: 24_000_000,
      yield_due: 2_880_000,
    }),
    order({
      id: "ord-1002",
      batch_id: "hb-1002",
      project_id: "proj-platano-meta",
      project_title: "Plátano Hartón · Granada",
      production_type: "Plátano",
      quantity_kg: 2000,
      unit_price: 3000,
      status: "PAYMENT_AUTHORIZED",
      created_at: "2026-10-10T14:00:00.000Z",
      grant: { state: "LIVE", cap: 6_000_000, approved_at: "2026-10-10T15:00:00.000Z", revoked_at: null, revocation_proof: null },
      events: [
        { status: "AWAITING_PAYMENT_AUTHORIZATION", at: "2026-10-10T14:00:00.000Z" },
        { status: "PAYMENT_AUTHORIZED", at: "2026-10-10T15:00:00.000Z" },
      ],
    }),
    order({
      id: "ord-1003",
      batch_id: "hb-1003",
      project_id: "ext-tolima-cacao",
      project_title: "Cacao fino · Tolima",
      production_type: "Cacao",
      quantity_kg: 1000,
      unit_price: 12000,
      status: "DISPATCHED",
      created_at: "2026-10-05T14:00:00.000Z",
      grant: { state: "LIVE", cap: 12_000_000, approved_at: "2026-10-05T15:00:00.000Z", revoked_at: null, revocation_proof: null },
      dispatch: { tracking_number: "GU-901377", carrier: "Coordinadora", photo_url: "https://images.example.com/dispatch/gu-901377.jpg", dispatched_at:"2026-10-09T13:00:00.000Z" },
      events: [
        { status: "AWAITING_PAYMENT_AUTHORIZATION", at: "2026-10-05T14:00:00.000Z" },
        { status: "PAYMENT_AUTHORIZED", at: "2026-10-05T15:00:00.000Z" },
        { status: "DISPATCHED", at: "2026-10-09T13:00:00.000Z" },
      ],
    }),
  ];

  const settlements: SettlementDto[] = [buildSettlement(orders[0], { next }, "2026-06-30T17:00:00.000Z")];

  return { batches, orders, settlements, next };
}
