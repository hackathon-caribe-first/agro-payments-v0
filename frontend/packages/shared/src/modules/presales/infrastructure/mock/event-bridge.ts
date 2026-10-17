import { MOCK_FAIL_HEADER, headerOf } from "../../../grants/infrastructure/mock/mock-fetch";
import { MOMENT_ORDER, canRetryPayment, pendingRetryText, type PaymentLine, type PaymentMoment } from "../../../payment-lines/domain/line";
import { previewSplit, splitContextOf, type PlannedPayment } from "../../../payment-lines/domain/split";
import { toLine } from "../../../payment-lines/infrastructure/mapper";
import type { PresalesMockStore } from "./store";

type Json = Record<string, unknown>;

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
};

const asList = (value: unknown, key: string): Json[] => {
  if (Array.isArray(value)) return value as Json[];
  const inner = (value as Json | null)?.[key];
  return Array.isArray(inner) ? (inner as Json[]) : [];
};

const conceptLabel = (line: PaymentLine): string => {
  switch (line.concept) {
    case "mano_de_obra":
      return "Mano de obra del hito";
    case "comision":
      return "Comisión de la plataforma";
    case "imprevisto":
      return `Imprevisto: ${line.reference}`;
    case "orden":
      return `Orden ${line.reference}`;
    default:
      return `Factura ${line.reference}`;
  }
};

const AFTER_APPROVAL_MOMENTS: readonly PaymentMoment[] = ["aprobacion", "liquidacion"];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const conflict = (message: string) => json({ error: "Request rejected", errors: { _form: [message] } }, 409);

interface PayOptions {
  // Mock-only failure injection forwarded to the spend endpoint (`x-mock-fail`).
  inject?: string;
  // Also pay the queued lines whose backoff has elapsed (lazy evaluation, no timers).
  dueRetries?: boolean;
  // "Reintentar pago": pay this line now, whatever its backoff.
  retryLineId?: string;
}

interface PayOutcome {
  hadGrant: boolean;
  paid: number;
}

// Thin composition-layer glue between mock workstreams: the platform's automatic engine of the PRD. Owners' handlers are untouched;
// every call goes over HTTP paths (`/api` prefix tolerated) and is idempotent and failure-tolerant: a failure here never alters
// the response of the call that triggered it.
//  1. POST /projects/:id/grants (201): CONTRACT_SIGNED -> FUNDING_IN_PROGRESS.
//  2. POST /grants/:id/continue (approval): FUNDED_IN_CUSTODY + hito 1 ACTIVE, then every pending `insumos` line is paid through the grant.
//  3. POST /milestone-lines (201): an `insumos` line (invoices, orders and `imprevisto` funds) on a milestone with an ACTIVE grant is paid
//     immediately; otherwise it stays pending.
//  4. POST /reviews/:id/dictamen (favorable): the platform pays the closing lines (the producer line and the platform commission, D-06)
//     through the grant FIRST; only when every line is settled does it confirm the payout (milestone COMPLETED_AND_PAID), revoke the grant,
//     request the next milestone's grant (still PENDING_APPROVAL: the investor approves it) and consume the outbox events. While a line
//     is queued or failed the milestone stays LABOR_PAYOUT_PENDING and the grant ACTIVE (PRD: the milestone does not close until all its
//     lines are in a final state); the retry that settles the last line closes it, exactly once.
//  6. RF-11: a network or 5xx failure of the wallet queues the line (`en_cola`) and schedules the next attempt with exponential backoff
//     (at most 5 attempts); the engine retries lazily on the next read or trigger. A business error (cap, revoked grant) is never retried.
//     POST /milestone-lines/:id/retry is the producer's "Reintentar pago" (idempotent by `milestone:line`).
export function createEventBridgeMockFetch(store: PresalesMockStore, chain: typeof fetch): typeof fetch {
  const call = async (method: "GET" | "POST", url: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: unknown }> => {
    const response = await chain(`http://mock.local${url}`, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body ?? {}) });
    return { status: response.status, data: await readJson(response) };
  };

  const grantsOf = async (projectId: string): Promise<Json[]> => asList((await call("GET", `/projects/${encodeURIComponent(projectId)}/grants`)).data, "grants");

  const wireLinesOf = async (milestoneId: string): Promise<Json[]> => asList((await call("GET", `/milestone-lines?milestone_id=${encodeURIComponent(milestoneId)}`)).data, "lines");

  // "Presupuesto ejecutado": always derived from the PAID lines of the milestone (a replayed payment never counts twice), never from the
  // budget. The supplies figure keeps the evidence-based seed when it is higher; labor follows the paid producer lines. The platform
  // commission is not part of the budget execution.
  const syncExecuted = async (milestoneId: string) => {
    const milestone = store.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return;
    const lines = (await wireLinesOf(milestoneId)).map((l) => toLine(l));
    const cap = milestone.supplies_budget + milestone.labor_budget;
    let supplies = 0;
    let labor = 0;
    for (const line of lines) {
      if (line.status !== "completado" || line.concept === "comision") continue;
      const fixed = line.amountMode === "fixed" ? line.value : Math.floor((cap * line.value) / 10000);
      const amount = line.receipt?.received ?? fixed;
      if (line.concept === "mano_de_obra" || line.beneficiary.role === "PRODUCER") labor += amount;
      else supplies += amount;
    }
    milestone.supplies_executed = Math.max(milestone.supplies_executed, supplies);
    if (lines.length > 0) milestone.labor_executed = labor;
  };

  const unsettledOf = async (milestoneId: string): Promise<number> =>
    (await wireLinesOf(milestoneId)).filter((l) => l.status === "QUEUED" || l.status === "FAILED").length;

  // Sends one planned payment through the grant. Business errors fail the line for good; transient ones queue it for a retry.
  const payOne = async (grantId: string, payment: PlannedPayment, anchor: PaymentLine, manual: boolean, inject?: string): Promise<"paid" | "queued" | "failed"> => {
    let spent: { status: number; data: unknown };
    try {
      spent = await call(
        "POST",
        `/grants/${encodeURIComponent(grantId)}/spend`,
        {
          line_id: payment.anchorLineId,
          concept: conceptLabel(anchor),
          beneficiary: payment.beneficiary.name,
          beneficiary_wallet: payment.beneficiary.walletAddress,
          received: payment.receive,
          fee: payment.commission,
        },
        inject ? { [MOCK_FAIL_HEADER]: inject } : {},
      );
    } catch {
      spent = { status: 0, data: null }; // the transport itself failed: a network error
    }
    const receipt = (spent.data as { receipt?: Json } | null)?.receipt;
    if ((spent.status === 200 || spent.status === 201) && receipt) {
      for (const lineId of payment.lineIds) {
        await call("POST", `/milestone-lines/${encodeURIComponent(lineId)}/mark-paid`, {
          receipt: {
            outgoing_payment_id: receipt.outgoing_payment_id,
            incoming_payment_id: receipt.incoming_payment_id,
            received: receipt.received,
            fee: receipt.fee,
            debited: receipt.debited,
          },
        });
      }
      return "paid";
    }
    const retryable = spent.status === 0 || spent.status >= 500;
    const errors = (spent.data as { errors?: Record<string, string[]>; error?: string } | null) ?? null;
    const code = retryable ? (spent.status === 0 ? "NETWORK_ERROR" : "SERVER_ERROR") : (errors?.error ?? "PAYMENT_REJECTED");
    const message = errors?.errors?._form?.[0] ?? (retryable ? "La billetera no respondió." : "El pago fue rechazado.");
    for (const lineId of payment.lineIds) {
      await call("POST", `/milestone-lines/${encodeURIComponent(lineId)}/attempt`, { retryable, code, message, manual });
    }
    return retryable ? "queued" : "failed";
  };

  // Pays, through the ACTIVE grant of the milestone, every pending payment whose moment is in `moments` (plus the queued ones that are due
  // or asked for). One at a time. Returns whether a grant was there to pay from and how many payments went through.
  const payLines = async (milestoneId: string, moments: readonly PaymentMoment[], options: PayOptions = {}): Promise<PayOutcome> => {
    const milestone = store.milestones.find((m) => m.id === milestoneId);
    if (!milestone) return { hadGrant: false, paid: 0 };
    const grant = (await grantsOf(milestone.project_id)).find((g) => g.milestone_id === milestoneId && g.status === "ACTIVE");
    if (!grant) return { hadGrant: false, paid: 0 };

    const lines = (await wireLinesOf(milestoneId)).map((l) => toLine(l));
    const ctx = splitContextOf({ id: milestoneId, cap: milestone.supplies_budget + milestone.labor_budget, currency: milestone.currency, scale: 0 });
    const now = Date.now();
    const payments = previewSplit(ctx, lines).payments.filter((p) => {
      const anchor = lines.find((l) => l.id === p.anchorLineId);
      if (p.status === "pendiente") return moments.includes(p.moment);
      if (!anchor || !canRetryPayment(anchor)) return false;
      if (options.retryLineId === anchor.id) return true;
      return Boolean(options.dueRetries && anchor.status === "en_cola" && anchor.nextAttemptAt && Date.parse(anchor.nextAttemptAt) <= now);
    });
    payments.sort((a, b) => MOMENT_ORDER[a.moment] - MOMENT_ORDER[b.moment]);

    let paid = 0;
    for (const payment of payments) {
      const anchor = lines.find((l) => l.id === payment.anchorLineId);
      if (!anchor) continue;
      const outcome = await payOne(String(grant.id), payment, anchor, options.retryLineId === anchor.id, options.inject);
      if (outcome === "paid") paid++;
    }
    await syncExecuted(milestoneId);
    return { hadGrant: true, paid };
  };

  const consume = async (milestoneId: string, types: readonly string[]) => {
    const events = asList((await call("GET", "/reviews/outbox")).data, "events");
    for (const e of events) {
      if (e.milestone_id === milestoneId && types.includes(String(e.type))) await call("POST", `/reviews/outbox/${encodeURIComponent(String(e.id))}/consume`);
    }
  };

  // PRD: the milestone is not closed until every one of its lines is in a final state. Pays the closing lines (producer line and commission)
  // through the grant; while any line is queued or failed the milestone stays in LABOR_PAYOUT_PENDING and the grant ACTIVE so the retry can
  // use it. Once everything is settled it completes the milestone (reviews confirm-payout) and closes the grant exactly once.
  const closeMilestone = async (milestoneId: string, inject?: string) => {
    const milestone = store.milestones.find((m) => m.id === milestoneId);
    if (!milestone || (milestone.status !== "LABOR_PAYOUT_PENDING" && milestone.status !== "COMPLETED_AND_PAID")) return;

    const { hadGrant } = await payLines(milestoneId, AFTER_APPROVAL_MOMENTS, { inject, dueRetries: true });
    if (!hadGrant) {
      // Nothing to pay from: the producer line still closes with the confirmed payout (as before the grants existed).
      const lines = await wireLinesOf(milestoneId);
      const producerLine = lines.find((l) => (l.beneficiary as { role?: string } | undefined)?.role === "PRODUCER" && l.status !== "COMPLETED");
      if (producerLine) await call("POST", `/milestone-lines/${encodeURIComponent(String(producerLine.id))}/mark-paid`);
    }
    if (hadGrant && (await unsettledOf(milestoneId)) > 0) return;

    if (milestone.status === "LABOR_PAYOUT_PENDING") {
      const paid = await call("POST", `/reviews/${encodeURIComponent(milestoneId)}/confirm-payout`, { actor_id: "platform" });
      if (paid.status !== 201 && paid.status !== 200) return; // the verifier's "Confirmar pago" button retries it
    }
    await syncExecuted(milestoneId);
    await consume(milestoneId, ["PAY_PRODUCER_LINE"]);

    // The grant dies with its LAST line (grant rule 4): every line is settled here.
    const grants = await grantsOf(milestone.project_id);
    const mine = grants.filter((g) => g.milestone_id === milestoneId);
    const active = mine.find((g) => g.status === "ACTIVE");
    if (active) await call("POST", `/grants/${encodeURIComponent(String(active.id))}/revoke`, { reason: "LAST_LINE_CONFIRMED" });
    const closed = active ?? mine.find((g) => g.status === "REVOKED");
    if (closed) await consume(milestoneId, ["REVOKE_MILESTONE_GRANT"]);

    const next = store.milestones.find((m) => m.project_id === milestone.project_id && m.sequence_order === milestone.sequence_order + 1);
    if (next && closed) {
      const live = (await grantsOf(milestone.project_id)).some((g) => g.milestone_id === next.id && (g.status === "PENDING_APPROVAL" || g.status === "ACTIVE"));
      if (!live) {
        const requested = await call("POST", `/projects/${encodeURIComponent(milestone.project_id)}/grants`, {
          milestone_id: next.id,
          investor_id: closed.investor_id,
          wallet: closed.wallet,
        });
        if (requested.status !== 201) return;
      }
      await consume(milestoneId, ["REQUEST_NEXT_MILESTONE_GRANT"]);
    }
  };

  // RF-11: lazy evaluation of the backoff. Runs when the lines of a milestone are read; pays what is due and, when that settles the last
  // line of a completed milestone, closes it like the original trigger would have.
  const retryDue = async (milestoneId: string) => {
    const wire = await wireLinesOf(milestoneId);
    const now = Date.now();
    const due = wire.some((l) => l.status === "QUEUED" && typeof l.next_attempt_at === "string" && Date.parse(l.next_attempt_at) <= now);
    if (!due) return;
    const { paid } = await payLines(milestoneId, [], { dueRetries: true });
    if (paid > 0) await closeMilestone(milestoneId);
  };

  const safely = async (work: () => Promise<void>) => {
    try {
      await work();
    } catch {
      // The automatic step failed: the original response stands and the manual controls remain available.
    }
  };

  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const parsedUrl = new URL(raw, "http://mock.local");
    const path = parsedUrl.pathname.replace(/^\/api/, "");
    const inject = headerOf(init, MOCK_FAIL_HEADER);

    // Reading the lines of a milestone evaluates the pending retries first (no real timers).
    if (method === "GET" && path === "/milestone-lines") {
      const milestoneId = parsedUrl.searchParams.get("milestone_id");
      if (milestoneId) await safely(() => retryDue(milestoneId));
      return chain(input, init);
    }

    // "Reintentar pago": POST /milestone-lines/:id/retry {milestone_id}. Idempotent: the grant answers a repeated key with the receipt.
    const retry = path.match(/^\/milestone-lines\/([^/]+)\/retry$/);
    if (method === "POST" && retry) {
      const lineId = decodeURIComponent(retry[1]);
      let milestoneId = "";
      try {
        milestoneId = String((JSON.parse(String(init?.body ?? "{}")) as Json).milestone_id ?? "");
      } catch {
        milestoneId = "";
      }
      const milestone = store.milestones.find((m) => m.id === milestoneId);
      const wire = milestone ? (await wireLinesOf(milestoneId)).find((l) => l.id === lineId) : undefined;
      if (!milestone || !wire) return json({ error: "Line not found" }, 404);
      const line = toLine(wire);
      if (line.status === "completado") return conflict("Esta línea ya está pagada: no se envía un segundo pago.");
      if (!canRetryPayment(line)) return conflict("Solo se reintentan las líneas en cola o fallidas.");
      const outcome = await payLines(milestoneId, [], { retryLineId: lineId, inject });
      if (!outcome.hadGrant) return conflict("El grant del hito no está activo: la línea se podrá pagar cuando lo esté.");
      if (outcome.paid > 0) await safely(() => closeMilestone(milestoneId));
      const refreshed = (await wireLinesOf(milestoneId)).find((l) => l.id === lineId);
      return json(refreshed ?? wire);
    }

    // "Confirmar pago" of the verifier: the milestone does not close while a line is queued or failed (PRD: all its lines in a final state).
    const confirming = path.match(/^\/reviews\/([^/]+)\/confirm-payout$/);
    if (method === "POST" && confirming) {
      const milestoneId = decodeURIComponent(confirming[1]);
      const milestone = store.milestones.find((m) => m.id === milestoneId);
      if (milestone?.status === "LABOR_PAYOUT_PENDING") {
        let open = 0;
        try {
          const { hadGrant } = await payLines(milestoneId, AFTER_APPROVAL_MOMENTS, { inject, dueRetries: true });
          open = hadGrant ? await unsettledOf(milestoneId) : 0;
        } catch {
          open = 0;
        }
        if (open > 0) return conflict(pendingRetryText(open));
      }
    }

    const response = await chain(input, init);
    if (method !== "POST" || !response.ok) return response;

    const requested = path.match(/^\/projects\/([^/]+)\/grants$/);
    if (requested) {
      const project = [...store.projects, ...store.externalProjects].find((p) => p.id === decodeURIComponent(requested[1]));
      if (project?.current_status === "CONTRACT_SIGNED") project.current_status = "FUNDING_IN_PROGRESS";
      return response;
    }

    // Grants only applies its first-approval interplay to store.projects; extend it to externalProjects (ext-* investor projects).
    const approved = path.match(/^\/grants\/([^/]+)\/continue$/);
    if (approved) {
      await safely(async () => {
        const detail = (await call("GET", `/grants/${approved[1]}`)).data as Json | null;
        const g = ((detail?.grant as Json | undefined) ?? detail) as Json | null;
        if (!g || g.status !== "ACTIVE") return;
        const project = store.externalProjects.find((p) => p.id === g.project_id);
        const first = store.milestones.find((m) => m.project_id === g.project_id && m.sequence_order === 1);
        if (project && first && first.id === g.milestone_id) {
          if (project.current_status === "FUNDING_IN_PROGRESS") project.current_status = "FUNDED_IN_CUSTODY";
          if (first.status === "LOCKED") first.status = "ACTIVE";
        }
        await payLines(String(g.milestone_id), ["insumos"], { inject, dueRetries: true });
      });
      return response;
    }

    if (path === "/milestone-lines") {
      await safely(async () => {
        const created = (await readJson(response)) as Json | null;
        if (created?.moment === "insumos" && typeof created.milestone_id === "string") await payLines(created.milestone_id, ["insumos"], { inject });
      });
      return response;
    }

    const dictamen = path.match(/^\/reviews\/([^/]+)\/dictamen$/);
    if (dictamen) {
      await safely(async () => {
        const entry = (await readJson(response)) as Json | null;
        if (entry?.verdict !== "APPROVED_FAVORABLE") return;
        const milestoneId = decodeURIComponent(dictamen[1]);
        await closeMilestone(milestoneId, inject);
      });
      return response;
    }

    const marked = path.match(/^\/milestone-lines\/[^/]+\/mark-paid$/);
    if (marked) {
      await safely(async () => {
        const line = (await readJson(response)) as Json | null;
        if (typeof line?.milestone_id === "string") await syncExecuted(line.milestone_id);
      });
      return response;
    }

    const payout = path.match(/^\/reviews\/([^/]+)\/confirm-payout$/);
    if (payout) {
      await safely(async () => {
        const milestoneId = decodeURIComponent(payout[1]);
        await consume(milestoneId, ["PAY_PRODUCER_LINE"]);
        await closeMilestone(milestoneId, inject);
      });
    }
    return response;
  };
}
