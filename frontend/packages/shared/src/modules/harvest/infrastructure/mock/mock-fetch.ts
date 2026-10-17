import { FORM_LEVEL_KEY, type FieldErrors } from "../../../milestones/domain/errors";
import type { PresalesMockStore } from "../../../presales/infrastructure/mock/store";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import { DECLARABLE_PROJECT_STATUSES } from "../../domain/rules";
import { yieldFor } from "../../domain/liquidation";
import { formatMoney } from "../../../milestones/milestone-state";
import type { ContractDto } from "../../../investments/infrastructure/dto";
import {
  authorizeBodyDtoSchema,
  buyerBodyDtoSchema,
  certifyBodyDtoSchema,
  commentsBodyDtoSchema,
  createOrderBodyDtoSchema,
  declareBodyDtoSchema,
  dispatchBodyDtoSchema,
  type HarvestBatchDto,
  type OrderDto,
} from "../dto";
import { createHarvestState, INVESTMENT_TERMS, PRODUCER, VERIFIER, type HarvestState } from "./fixtures";
import { buildSettlement } from "./settle";

// Mock server for /harvest/**, /marketplace/**, /orders/** and /settlements/**. Own state lives in `createHarvestState()`.
//
// STATUS INTERPLAY (documented in-place mutation of `store.projects`, the only thing this handler writes outside its state):
//   declare            -> HARVEST_DECLARED
//   certify            -> HARVEST_CERTIFIED, then LISTED_IN_MARKET
//   authorize payment  -> MARKET_PAYMENT_HELD   (wire name of the "order payment authorized, money still in buyer wallet" state)
//   confirm reception  -> DELIVERED_TO_BUYER -> SETTLEMENT_PROCESSING -> SETTLED_AND_CLOSED (lot sold out) or back to LISTED_IN_MARKET
// Projects that do not exist in `store.projects` (seeded snapshots) are skipped.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const reject = (status: 400 | 409, errors: FieldErrors) => json({ error: "Request rejected", errors }, status);
const invalid = (errors: FieldErrors) => reject(400, errors);
const conflict = (message: string) => reject(409, { [FORM_LEVEL_KEY]: [message] });
const malformed = () => invalid({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] });
const notFound = () => json({ error: "Not found" }, 404);

const OPEN_ORDER = ["AWAITING_PAYMENT_AUTHORIZATION", "PAYMENT_AUTHORIZED", "DISPATCHED", "RECEIVED_CONFIRMED"];

async function readBody(init?: RequestInit): Promise<unknown> {
  try {
    return JSON.parse(String(init?.body ?? "null"));
  } catch {
    return null;
  }
}

// Tiny deterministic hash standing in for the verifier's signature.
function signatureHash(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return `sig-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export function createHarvestMockFetch(base: PresalesMockStore, delegate: typeof fetch): typeof fetch {
  const state: HarvestState = createHarvestState();
  const now = () => new Date().toISOString();

  const project = (id: string): ProjectDto | undefined => base.projects.find((p) => p.id === id);
  const setProjectStatus = (id: string, status: ProjectDto["current_status"]) => {
    const p = project(id);
    if (p) p.current_status = status;
  };

  const ordersOf = (batchId: string) => state.orders.filter((o) => o.batch_id === batchId);
  // Derived fields: stock left and whether an order is in progress.
  const serveBatch = (b: HarvestBatchDto): HarvestBatchDto => {
    const live = ordersOf(b.id).filter((o) => o.status !== "CANCELLED");
    const reserved = live.reduce((sum, o) => sum + o.quantity_kg, 0);
    return {
      ...b,
      available_kg: b.status === "CERTIFIED_LISTED" ? Math.max(0, (b.certified_kg ?? 0) - reserved) : 0,
      has_open_order: live.some((o) => OPEN_ORDER.includes(o.status)),
    };
  };
  const batchById = (id: string) => state.batches.find((b) => b.id === id);
  const orderById = (id: string) => state.orders.find((o) => o.id === id);
  const detail = (o: OrderDto) => ({ order: o, settlement: state.settlements.find((s) => s.order_id === o.id) ?? null });

  const pushEvent = (o: OrderDto, status: string) => {
    o.status = status;
    o.events.push({ status, at: now() });
  };

  const parseBody = <T,>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, raw: unknown): T | null => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? (parsed.data as T) : null;
  };

  // Capital and yield of the settlement come from the SIGNED investment contract of the project, read through the chain (the
  // investments handler sits INNER relative to this one). Only seeded projects without a contract fall back to the seeded map.
  async function termsFor(p: ProjectDto): Promise<{ capital: number; yieldPct: number }> {
    try {
      const listed = await delegate(`http://mock.local/investments/proposals?project_id=${encodeURIComponent(p.id)}`);
      const proposals = listed.ok ? ((await listed.json()) as { contract_id?: string | null }[]) : [];
      for (const proposal of proposals) {
        if (!proposal.contract_id) continue;
        const response = await delegate(`http://mock.local/contracts/${encodeURIComponent(proposal.contract_id)}`);
        if (!response.ok) continue;
        const contract = (await response.json()) as ContractDto;
        if (contract.status === "SIGNED") return { capital: contract.amount, yieldPct: contract.yield_bps / 100 };
      }
    } catch {
      // No contract reachable: use the seeds below.
    }
    return INVESTMENT_TERMS[p.id] ?? { capital: p.target_amount, yieldPct: Math.round(p.investor_roi_pct) };
  }

  async function declare(projectId: string, init: RequestInit | undefined): Promise<Response> {
    const p = project(projectId);
    if (!p) return notFound();
    const body = parseBody(declareBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    const milestones = base.milestones.filter((m) => m.project_id === projectId);
    if (!(DECLARABLE_PROJECT_STATUSES as readonly string[]).includes(p.current_status)) return conflict("Este proyecto no está en una etapa que permita declarar la cosecha.");
    if (milestones.length === 0 || milestones.some((m) => m.status !== "COMPLETED_AND_PAID")) {
      return conflict("Todos los hitos deben estar completados y pagados antes de declarar la cosecha.");
    }
    if (state.batches.some((b) => b.project_id === projectId && b.status !== "SOLD_OUT")) return conflict("Este proyecto ya tiene una cosecha declarada.");
    const terms = await termsFor(p);
    const created: HarvestBatchDto = {
      id: state.next("hb"),
      project_id: p.id,
      project_title: p.title,
      production_type: p.production_type,
      producer_id: PRODUCER.id,
      producer_name: PRODUCER.name,
      status: "DECLARED_BY_PRODUCER",
      declared_kg: body.harvested_kg,
      certified_kg: null,
      asking_price_per_kg: body.asking_price_per_kg,
      available_kg: 0,
      has_open_order: false,
      currency: p.currency,
      quality_metrics: body.quality_metrics,
      certified_metrics: null,
      notes: body.notes,
      photo_urls: body.photo_urls,
      declared_at: now(),
      correction_notes: null,
      certification: null,
      investor_capital: terms.capital,
      investor_yield_pct: terms.yieldPct,
      capital_outstanding: terms.capital,
      yield_outstanding: yieldFor(terms.capital, terms.yieldPct),
    };
    state.batches.push(created);
    p.current_status = "HARVEST_DECLARED";
    return json(serveBatch(created), 201);
  }

  async function resubmit(batchId: string, init: RequestInit | undefined): Promise<Response> {
    const b = batchById(batchId);
    if (!b) return notFound();
    const body = parseBody(declareBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    if (b.status !== "CORRECTIONS_REQUESTED") return conflict("Este lote no tiene correcciones pendientes.");
    Object.assign(b, {
      status: "DECLARED_BY_PRODUCER",
      declared_kg: body.harvested_kg,
      asking_price_per_kg: body.asking_price_per_kg,
      quality_metrics: body.quality_metrics,
      notes: body.notes,
      photo_urls: body.photo_urls,
      correction_notes: null,
      declared_at: now(),
    });
    return json(serveBatch(b));
  }

  async function certify(batchId: string, init: RequestInit | undefined): Promise<Response> {
    const b = batchById(batchId);
    if (!b) return notFound();
    const body = parseBody(certifyBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    if (b.status !== "DECLARED_BY_PRODUCER") return conflict("Esta cosecha ya fue dictaminada.");
    if (body.certified_kg > b.declared_kg) return invalid({ certifiedKg: [`El peso certificado no puede superar lo declarado (${b.declared_kg} kg).`] });
    const at = now();
    Object.assign(b, {
      status: "CERTIFIED_LISTED",
      certified_kg: body.certified_kg,
      certified_metrics: body.certified_metrics,
      certification: {
        verifier_name: VERIFIER.name,
        comments: body.comments,
        signature_hash: signatureHash(`${b.id}|${body.certified_kg}|${body.comments}|${at}`),
        certified_at: at,
      },
    });
    setProjectStatus(b.project_id, "HARVEST_CERTIFIED");
    setProjectStatus(b.project_id, "LISTED_IN_MARKET");
    return json(serveBatch(b));
  }

  async function requestCorrections(batchId: string, init: RequestInit | undefined): Promise<Response> {
    const b = batchById(batchId);
    if (!b) return notFound();
    const body = parseBody(commentsBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    if (b.status !== "DECLARED_BY_PRODUCER") return conflict("Esta cosecha ya fue dictaminada.");
    b.status = "CORRECTIONS_REQUESTED";
    b.correction_notes = body.comments;
    return json(serveBatch(b));
  }

  async function createOrder(init: RequestInit | undefined): Promise<Response> {
    const body = parseBody(createOrderBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    const raw = batchById(body.batch_id);
    if (!raw || raw.status !== "CERTIFIED_LISTED") return conflict("Este lote ya no está disponible en el mercado.");
    const lot = serveBatch(raw);
    if (lot.has_open_order) return conflict("Este lote tiene una orden en curso. Vuelve a intentarlo cuando se complete.");
    if (body.quantity_kg > lot.available_kg) return invalid({ quantityKg: [`La cantidad no puede superar ${lot.available_kg} kg disponibles.`] });
    const total = body.quantity_kg * raw.asking_price_per_kg;
    const created: OrderDto = {
      id: state.next("ord"),
      batch_id: raw.id,
      project_id: raw.project_id,
      project_title: raw.project_title,
      production_type: raw.production_type,
      buyer_id: body.buyer_id,
      buyer_name: "Comercializadora Andina S.A.S.",
      producer_id: raw.producer_id,
      producer_name: raw.producer_name,
      quantity_kg: body.quantity_kg,
      unit_price: raw.asking_price_per_kg,
      total,
      currency: raw.currency,
      status: "AWAITING_PAYMENT_AUTHORIZATION",
      grant: { state: "NONE", cap: total, approved_at: null, revoked_at: null, revocation_proof: null },
      dispatch: null,
      received_at: null,
      created_at: now(),
      events: [{ status: "AWAITING_PAYMENT_AUTHORIZATION", at: now() }],
      capital_due: raw.capital_outstanding,
      yield_due: raw.yield_outstanding,
      platform_fee_bp: 200,
    };
    state.orders.push(created);
    return json(created, 201);
  }

  async function authorize(o: OrderDto, init: RequestInit | undefined): Promise<Response> {
    const body = parseBody(authorizeBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    if (body.buyer_id !== o.buyer_id) return conflict("Solo el comprador de esta orden puede autorizar el pago.");
    const reauthorize = (o.status === "PAYMENT_AUTHORIZED" || o.status === "DISPATCHED") && o.grant.state === "REVOKED_BY_BUYER";
    if (o.status !== "AWAITING_PAYMENT_AUTHORIZATION" && !reauthorize) return conflict("Esta orden no tiene una autorización de pago pendiente.");
    if (body.expected_total !== o.total) return conflict(`El total de la orden cambió a ${formatMoney(o.total, o.currency)}. Revisa el monto antes de autorizar.`);
    o.grant = { state: "LIVE", cap: o.total, approved_at: now(), revoked_at: null, revocation_proof: null };
    if (!reauthorize) {
      pushEvent(o, "PAYMENT_AUTHORIZED");
      setProjectStatus(o.project_id, "MARKET_PAYMENT_HELD");
    }
    return json(detail(o));
  }

  async function revoke(o: OrderDto, init: RequestInit | undefined): Promise<Response> {
    const body = parseBody(buyerBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    if (body.buyer_id !== o.buyer_id) return conflict("Solo el comprador de esta orden puede revocar la autorización.");
    if ((o.status !== "PAYMENT_AUTHORIZED" && o.status !== "DISPATCHED") || o.grant.state !== "LIVE") return conflict("La autorización de pago ya no está vigente.");
    o.grant = { ...o.grant, state: "REVOKED_BY_BUYER", revoked_at: now(), revocation_proof: "El comprador revocó el permiso desde su billetera." };
    return json(detail(o));
  }

  async function cancel(o: OrderDto, init: RequestInit | undefined): Promise<Response> {
    const body = parseBody(buyerBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    if (body.buyer_id !== o.buyer_id) return conflict("Solo el comprador de esta orden puede cancelarla.");
    if (o.status !== "AWAITING_PAYMENT_AUTHORIZATION" && !(o.status === "PAYMENT_AUTHORIZED" && !o.dispatch)) return conflict("Esta orden ya no se puede cancelar.");
    const wasAuthorized = o.status === "PAYMENT_AUTHORIZED";
    if (o.grant.state === "LIVE") o.grant = { ...o.grant, state: "NONE", revoked_at: now(), revocation_proof: "La Plataforma revocó el permiso al cancelar la orden." };
    pushEvent(o, "CANCELLED");
    if (wasAuthorized) setProjectStatus(o.project_id, "LISTED_IN_MARKET");
    return json(detail(o));
  }

  async function dispatchOrder(o: OrderDto, init: RequestInit | undefined): Promise<Response> {
    const body = parseBody(dispatchBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    if (o.status !== "PAYMENT_AUTHORIZED") return conflict("Esta orden no está lista para despacho.");
    if (o.grant.state !== "LIVE") return conflict("El comprador revocó la autorización de pago. No despaches hasta que la apruebe de nuevo.");
    if (!/^[A-Za-z0-9-]{6,30}$/.test(body.tracking_number)) return invalid({ trackingNumber: ["La guía debe tener entre 6 y 30 letras, números o guiones."] });
    o.dispatch = { tracking_number: body.tracking_number, carrier: body.carrier, photo_url: body.photo_url, dispatched_at: now() };
    pushEvent(o, "DISPATCHED");
    return json(detail(o));
  }

  async function confirmReception(o: OrderDto, init: RequestInit | undefined): Promise<Response> {
    const body = parseBody(buyerBodyDtoSchema, await readBody(init));
    if (!body) return malformed();
    if (body.buyer_id !== o.buyer_id) return conflict("Solo el comprador de esta orden puede confirmar la recepción.");
    if (o.status !== "DISPATCHED") return conflict("La orden todavía no fue despachada.");
    if (o.grant.state !== "LIVE") return conflict("La autorización de pago fue revocada: apruébala de nuevo para poder liquidar.");
    const at = now();
    o.received_at = at;
    pushEvent(o, "RECEIVED_CONFIRMED");
    setProjectStatus(o.project_id, "DELIVERED_TO_BUYER");
    setProjectStatus(o.project_id, "SETTLEMENT_PROCESSING");

    const settlement = buildSettlement(o, state, at);
    state.settlements.push(settlement);
    o.grant = {
      ...o.grant,
      state: "REVOKED_AFTER_SETTLEMENT",
      revoked_at: at,
      revocation_proof: `Autorización cerrada: tope ${formatMoney(settlement.revocation?.cap ?? o.total, o.currency)}, gastado ${formatMoney(o.total, o.currency)}.`,
    };
    pushEvent(o, "SETTLED");

    const lot = batchById(o.batch_id);
    if (lot) {
      const paid = (kind: string) => settlement.lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.amount, 0);
      // D-04: a loss is final, the investor does not get the shortfall later from another order.
      lot.capital_outstanding = settlement.loss ? 0 : lot.capital_outstanding - paid("INVESTOR_CAPITAL");
      lot.yield_outstanding = settlement.loss ? 0 : lot.yield_outstanding - paid("INVESTOR_YIELD");
      const sold = ordersOf(lot.id).filter((x) => x.status !== "CANCELLED").reduce((s, x) => s + x.quantity_kg, 0);
      if (sold >= (lot.certified_kg ?? 0)) {
        lot.status = "SOLD_OUT";
        setProjectStatus(lot.project_id, "SETTLED_AND_CLOSED");
      } else {
        setProjectStatus(lot.project_id, "LISTED_IN_MARKET");
      }
    }
    return json(detail(o));
  }

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const path = url.pathname.replace(/^\/api/, "");
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    // ---- harvest (producer + verifier) ----
    let m = path.match(/^\/harvest\/projects\/([^/]+)\/declaration$/);
    if (m && method === "GET") {
      const p = project(decodeURIComponent(m[1]));
      if (!p) return notFound();
      return json({
        project: { id: p.id, title: p.title, production_type: p.production_type, current_status: p.current_status, currency: p.currency },
        milestones: base.milestones
          .filter((x) => x.project_id === p.id)
          .map((x) => ({ id: x.id, title: x.title, sequence_order: x.sequence_order, status: x.status })),
        batches: state.batches.filter((b) => b.project_id === p.id).map(serveBatch),
      });
    }
    m = path.match(/^\/harvest\/projects\/([^/]+)\/batches$/);
    if (m && method === "POST") return declare(decodeURIComponent(m[1]), init);

    if (/^\/harvest\/batches$/.test(path) && method === "GET") {
      const status = url.searchParams.get("status");
      const producer = url.searchParams.get("producer_id");
      return json(
        state.batches
          .filter((b) => (!status || b.status === status) && (!producer || b.producer_id === producer))
          .sort((a, b) => a.declared_at.localeCompare(b.declared_at))
          .map(serveBatch),
      );
    }
    m = path.match(/^\/harvest\/batches\/([^/]+)$/);
    if (m && method === "GET") {
      const b = batchById(decodeURIComponent(m[1]));
      return b ? json(serveBatch(b)) : notFound();
    }
    m = path.match(/^\/harvest\/batches\/([^/]+)\/(resubmit|certify|request-corrections)$/);
    if (m && method === "POST") {
      const id = decodeURIComponent(m[1]);
      if (m[2] === "resubmit") return resubmit(id, init);
      if (m[2] === "certify") return certify(id, init);
      return requestCorrections(id, init);
    }

    // ---- marketplace ----
    if (/^\/marketplace\/lots$/.test(path) && method === "GET") {
      const type = url.searchParams.get("type")?.toLowerCase();
      return json(
        state.batches
          .map(serveBatch)
          .filter((b) => b.status === "CERTIFIED_LISTED" && b.available_kg > 0 && !b.has_open_order)
          .filter((b) => !type || b.production_type.toLowerCase() === type),
      );
    }
    m = path.match(/^\/marketplace\/lots\/([^/]+)$/);
    if (m && method === "GET") {
      const b = batchById(decodeURIComponent(m[1]));
      return b && (b.status === "CERTIFIED_LISTED" || b.status === "SOLD_OUT") ? json(serveBatch(b)) : notFound();
    }

    // ---- orders ----
    if (/^\/orders$/.test(path)) {
      if (method === "POST") return createOrder(init);
      if (method === "GET") {
        const buyer = url.searchParams.get("buyer_id");
        const producer = url.searchParams.get("producer_id");
        return json(
          state.orders
            .filter((o) => (!buyer || o.buyer_id === buyer) && (!producer || o.producer_id === producer))
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        );
      }
    }
    m = path.match(/^\/orders\/([^/]+)$/);
    if (m && method === "GET") {
      const o = orderById(decodeURIComponent(m[1]));
      return o ? json(detail(o)) : notFound();
    }
    m = path.match(/^\/orders\/([^/]+)\/(authorize-payment|revoke-authorization|cancel|dispatch|confirm-reception)$/);
    if (m && method === "POST") {
      const o = orderById(decodeURIComponent(m[1]));
      if (!o) return notFound();
      switch (m[2]) {
        case "authorize-payment":
          return authorize(o, init);
        case "revoke-authorization":
          return revoke(o, init);
        case "cancel":
          return cancel(o, init);
        case "dispatch":
          return dispatchOrder(o, init);
        default:
          return confirmReception(o, init);
      }
    }

    // ---- settlements ----
    if (/^\/settlements$/.test(path) && method === "GET") return json(state.settlements);
    m = path.match(/^\/settlements\/projects\/([^/]+)$/);
    if (m && method === "GET") {
      const id = decodeURIComponent(m[1]);
      return json(state.settlements.filter((s) => s.project_id === id));
    }

    return delegate(input, init);
  };
}
