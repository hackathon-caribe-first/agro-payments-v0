import type { MilestoneStatus } from "../../../milestones/domain/milestone";
import { currentFieldData } from "../../../milestones/domain/milestone-rules";
import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import { FIXTURE_PHOTO_URLS } from "../../../milestones/infrastructure/mock/fixtures";
import { toMilestoneDetail } from "../../../milestones/infrastructure/mapper";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { PresalesMockStore } from "../../../presales/infrastructure/mock/store";
import { PRODUCER_BENEFICIARY } from "../../../payment-lines/domain/line";
import { VERIFIER_PROFILE, type NotificationRole, type QueueTab } from "../../domain/review";
import { DECIDED_STATUSES, draftEvaluation, hasSignedApproval } from "../../domain/review-rules";
import { fallbackHash, signDictamenFallback } from "../../domain/signature";
import type { DictamenRequestDto, QueueItemDto, ReviewDetailDto, ReviewEntryDto, PayoutDto } from "../dto";
import { toReviewEntry } from "../mapper";
import type { ReviewsState } from "./state";

type Actor = ReviewEntryDto["actor"];

const PLATFORM: Actor = { id: "platform", name: "Plataforma", role: "PLATFORM" };
const PRODUCER: Actor = { id: "producer-local", name: "Productor del proyecto", role: "PRODUCER" };
const OTHER_VERIFIER = { verifier_id: "verifier-andres-pena", verifier_name: "Andrés Peña (verificador)", assigned_at: "2026-07-22T09:00:00Z" };
const FIXED_VERIFIER = { verifier_id: VERIFIER_PROFILE.id, verifier_name: VERIFIER_PROFILE.name, assigned_at: "2026-07-20T09:00:00Z" };

// Assignment of verifiers to projects: the fixed VERIFIER profile covers the local producer's projects; the projects of other
// producers (ids ext-*) belong to a different verifier, which is what makes the "only the assigned verifier" rule observable.
export const assignmentFor = (projectId: string) => (projectId.startsWith("ext-") ? OTHER_VERIFIER : FIXED_VERIFIER);

const projectOf = (base: PresalesMockStore, id: string): ProjectDto | undefined =>
  base.projects.find((p) => p.id === id) ?? base.externalProjects.find((p) => p.id === id);

const TAB_STATUSES: Record<QueueTab, readonly MilestoneStatus[]> = {
  pending: ["SUBMITTED_FOR_REVIEW"],
  changes: ["CHANGES_REQUESTED"],
  decided: DECIDED_STATUSES,
};

const lastReview = (m: MilestoneDetailDto, verdicts: readonly string[]) =>
  [...m.reviews].reverse().find((r) => verdicts.includes(r.verdict));

// ---- notifications and outbox ----

const hrefFor = (role: NotificationRole, milestoneId: string) =>
  role === "PRODUCER" ? `/producer/milestones/${milestoneId}` : role === "VERIFIER" ? `/verifier/reviews/${milestoneId}` : null;

function notify(state: ReviewsState, role: NotificationRole, m: MilestoneDetailDto, title: string, body: string, id?: string, createdAt?: string) {
  state.notifications.push({
    id: id ?? state.nextId("ntf"),
    role,
    title,
    body,
    milestone_id: m.id,
    href: hrefFor(role, m.id),
    created_at: createdAt ?? state.now(),
    read_at: null,
  });
}

const label = (m: MilestoneDetailDto) => `hito ${m.sequence_order} «${m.title}»`;

// The producer re-submits through the existing producer pages, which this module does not hook: pending submissions are
// detected from the shared milestone data and turned into one "Nueva verificación" notification per submission.
export function syncSubmissionNotifications(base: PresalesMockStore, state: ReviewsState) {
  for (const m of base.milestones) {
    if (m.status !== "SUBMITTED_FOR_REVIEW") continue;
    const submitted = lastReview(m, ["SUBMITTED"]);
    if (!submitted) continue;
    const id = `ntf-sub-${submitted.id}`;
    if (state.notifications.some((n) => n.id === id)) continue;
    const project = projectOf(base, m.project_id);
    notify(state, "VERIFIER", m, "Nueva verificación", `El ${label(m)} de «${project?.title ?? m.project_id}» espera tu dictamen.`, id, submitted.created_at);
  }
}

// ---- queue and detail ----

export function buildQueue(base: PresalesMockStore, state: ReviewsState, verifierId: string, tab: QueueTab): QueueItemDto[] {
  syncSubmissionNotifications(base, state);
  const items = base.milestones
    .filter((m) => assignmentFor(m.project_id).verifier_id === verifierId && TAB_STATUSES[tab].includes(m.status))
    .map((m): QueueItemDto => {
      const reference =
        tab === "pending" ? lastReview(m, ["SUBMITTED"]) : tab === "changes" ? lastReview(m, ["CHANGES_REQUESTED"]) : lastReview(m, ["PAYOUT_EXECUTED", "APPROVED_FAVORABLE"]);
      return {
        milestone_id: m.id,
        project_id: m.project_id,
        project_title: projectOf(base, m.project_id)?.title ?? m.project_id,
        sequence_order: m.sequence_order,
        title: m.title,
        status: m.status,
        currency: m.currency,
        supplies_budget: m.supplies_budget,
        labor_budget: m.labor_budget,
        log_count: m.evidence_logs.length,
        reference_at: reference?.created_at ?? null,
        last_comment: [...m.reviews].reverse().find((r) => r.comment)?.comment ?? null,
      };
    });
  // Pending is a FIFO queue (oldest submission first); the other tabs show the most recent first.
  const order = (a: QueueItemDto, b: QueueItemDto) => (a.reference_at ?? "").localeCompare(b.reference_at ?? "");
  return tab === "pending" ? items.sort(order) : items.sort((a, b) => order(b, a));
}

function synthesizeEntry(m: MilestoneDetailDto, r: MilestoneDetailDto["reviews"][number]): ReviewEntryDto {
  const assignment = assignmentFor(m.project_id);
  const verifier: Actor = { id: assignment.verifier_id, name: assignment.verifier_name, role: "VERIFIER" };
  const common = {
    id: r.id,
    milestone_id: m.id,
    comments: r.comment,
    technical_evaluation_json: [],
    subsanaciones: [],
    evidence_snapshot_json: null,
    signature_hash: null,
    created_at: r.created_at,
  };
  switch (r.verdict) {
    case "SUBMITTED":
      return { ...common, actor: PRODUCER, from_status: null, to_status: "SUBMITTED_FOR_REVIEW", verdict: "SUBMITTED" };
    case "CHANGES_REQUESTED":
      return { ...common, actor: verifier, from_status: "SUBMITTED_FOR_REVIEW", to_status: "CHANGES_REQUESTED", verdict: "CHANGES_REQUESTED" };
    case "APPROVED_FAVORABLE":
      return { ...common, actor: verifier, from_status: "SUBMITTED_FOR_REVIEW", to_status: "TECHNICALLY_APPROVED", verdict: "APPROVED_FAVORABLE" };
    default:
      return { ...common, actor: PLATFORM, from_status: "LABOR_PAYOUT_PENDING", to_status: "COMPLETED_AND_PAID", verdict: r.verdict };
  }
}

// Deterministic capture data per photo: this slice has no upload, so GPS and time come from the URL and the log date.
function photoMeta(m: MilestoneDetailDto): ReviewDetailDto["photo_meta"] {
  const meta: ReviewDetailDto["photo_meta"] = {};
  for (const log of m.evidence_logs) {
    for (const value of Object.values(log.evidence_payload)) {
      if (!Array.isArray(value)) continue;
      for (const url of value) {
        const h = fallbackHash(url);
        const unit = (from: number) => parseInt(h.slice(from, from + 6), 16) / 0xffffff;
        meta[url] = {
          lat: Math.round((4.2 + unit(0) * 0.6) * 1e5) / 1e5,
          lng: Math.round((-75.9 + unit(6) * 0.6) * 1e5) / 1e5,
          accuracy_m: Math.round((3 + unit(12) * 12) * 10) / 10,
          captured_at: log.created_at,
        };
      }
    }
  }
  return meta;
}

export function buildDetail(base: PresalesMockStore, state: ReviewsState, m: MilestoneDetailDto, verifierId: string): ReviewDetailDto {
  const project = projectOf(base, m.project_id);
  const assignment = assignmentFor(m.project_id);
  const rich = state.entries.filter((e) => e.milestone_id === m.id);
  const byId = new Map(rich.map((e) => [e.id, e]));
  const history = [
    ...m.reviews.map((r) => byId.get(r.id) ?? synthesizeEntry(m, r)),
    ...rich.filter((e) => !m.reviews.some((r) => r.id === e.id)),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    milestone: m,
    project: { id: m.project_id, code: project?.project_code ?? m.project_id, title: project?.title ?? m.project_id },
    assignment,
    history,
    photo_meta: photoMeta(m),
    payout: state.payouts.find((p) => p.milestone_id === m.id) ?? null,
    can_review: assignment.verifier_id === verifierId,
  };
}

// ---- transitions ----

function complete(base: PresalesMockStore, state: ReviewsState, m: MilestoneDetailDto, at: string, receipt: PayoutDto | null) {
  m.status = "COMPLETED_AND_PAID";
  if (receipt) {
    // labor_executed is never set from the budget: the platform derives it from the PAID lines (event bridge, syncExecuted).
    m.reviews.push({ id: receipt.receipt_id, verdict: "PAYOUT_EXECUTED", comment: `Pago de mano de obra ejecutado. Comprobante ${receipt.receipt_id}.`, created_at: at });
  }

  // The grant of this milestone dies with its last payment; the next one is requested only afterwards (PRD · Grant por hito, regla 6).
  const next = base.milestones.find((x) => x.project_id === m.project_id && x.sequence_order === m.sequence_order + 1);
  const common = { milestone_id: m.id, project_id: m.project_id, currency: m.currency, amount: null };
  state.outbox.push({ id: state.nextId("evt"), type: "REVOKE_MILESTONE_GRANT", next_milestone_id: null, created_at: at, ...common });
  if (next) {
    state.outbox.push({ id: state.nextId("evt"), type: "REQUEST_NEXT_MILESTONE_GRANT", next_milestone_id: next.id, created_at: at, ...common });
    if (next.status === "LOCKED") next.status = "ACTIVE";
  }

  notify(state, "PRODUCER", m, "Hito completado y pagado", `El ${label(m)} quedó completado${receipt ? ` y tu pago se confirmó (comprobante ${receipt.receipt_id})` : ""}.${next ? ` El ${label(next)} ya está activo.` : ""}`);
  notify(state, "INVESTOR", m, "Hito completado y pagado", `El ${label(m)} se cerró con dictamen aprobado; el permiso de pago del hito se revoca${next ? " y se solicitará el del siguiente" : ""}.`);
}

export function applyDictamen(base: PresalesMockStore, state: ReviewsState, m: MilestoneDetailDto, body: DictamenRequestDto): ReviewEntryDto {
  const detail = toMilestoneDetail(m);
  const assignment = assignmentFor(m.project_id);
  const actor: Actor = { id: body.verifier_id, name: assignment.verifier_name, role: "VERIFIER" };
  const at = state.now();
  const approved = body.verdict === "APPROVED_FAVORABLE";
  const fromStatus = m.status;

  const comment = approved
    ? body.comments
    : `${body.comments} Subsanaciones: ${body.subsanaciones.map((s, i) => `${i + 1}) ${s}`).join(" ")}`;
  const reviewId = state.nextId("rev-v");
  m.reviews.push({ id: reviewId, verdict: approved ? "APPROVED_FAVORABLE" : "CHANGES_REQUESTED", comment, created_at: at });

  const entry: ReviewEntryDto = {
    id: reviewId,
    milestone_id: m.id,
    actor,
    from_status: fromStatus,
    to_status: approved ? "TECHNICALLY_APPROVED" : "CHANGES_REQUESTED",
    verdict: approved ? "APPROVED_FAVORABLE" : "CHANGES_REQUESTED",
    comments: body.comments,
    technical_evaluation_json: body.technical_evaluation,
    subsanaciones: body.subsanaciones,
    evidence_snapshot_json: { log_ids: m.evidence_logs.map((l) => l.id), field_data: currentFieldData(detail.logs) },
    signature_hash: body.signature_hash,
    created_at: at,
  };
  state.entries.push(entry);

  if (!approved) {
    m.status = "CHANGES_REQUESTED";
    notify(state, "PRODUCER", m, "Hito observado", `El verificador observó el ${label(m)}: ${body.subsanaciones.length === 1 ? "corrige la subsanación" : `corrige las ${body.subsanaciones.length} subsanaciones`} y vuelve a solicitar la verificación.`);
    notify(state, "INVESTOR", m, "Hito observado", `El ${label(m)} volvió al productor para correcciones. El permiso de pago sigue vigente y no se pagó la línea del productor.`);
    return entry;
  }

  m.status = "TECHNICALLY_APPROVED";
  notify(state, "PRODUCER", m, "Hito aprobado", `El ${label(m)} tiene dictamen aprobado.${m.labor_budget > 0 ? " Tu pago de mano de obra está en proceso." : ""}`);
  notify(state, "INVESTOR", m, "Hito aprobado", `El ${label(m)} fue aprobado técnicamente.${m.labor_budget > 0 ? " Se pagará la línea del productor." : ""}`);

  // System step: the approval releases the producer line (or closes the milestone when there is no labor budget).
  const hasLabor = m.labor_budget > 0;
  const systemAt = state.now();
  state.entries.push({
    id: state.nextId("rev-sys"),
    milestone_id: m.id,
    actor: PLATFORM,
    from_status: "TECHNICALLY_APPROVED",
    to_status: hasLabor ? "LABOR_PAYOUT_PENDING" : "COMPLETED_AND_PAID",
    verdict: null,
    comments: hasLabor ? "Dictamen aprobado: se solicita el pago de la línea del productor." : "Dictamen aprobado: el hito no tiene mano de obra por pagar.",
    technical_evaluation_json: [],
    subsanaciones: [],
    evidence_snapshot_json: null,
    signature_hash: null,
    created_at: systemAt,
  });
  if (hasLabor) {
    m.status = "LABOR_PAYOUT_PENDING";
    state.outbox.push({ id: state.nextId("evt"), type: "PAY_PRODUCER_LINE", milestone_id: m.id, project_id: m.project_id, next_milestone_id: null, amount: m.labor_budget, currency: m.currency, created_at: systemAt });
  } else {
    complete(base, state, m, systemAt, null);
  }
  return entry;
}

// Marks the producer line as paid: stands for the confirmed Open Payments outgoing payment (PRD request #11).
export function confirmPayout(base: PresalesMockStore, state: ReviewsState, m: MilestoneDetailDto, actorId: string): PayoutDto {
  const at = state.now();
  const receipt: PayoutDto = {
    receipt_id: `OP-${fallbackHash(`${m.id}:${at}`).slice(0, 12).toUpperCase()}`,
    milestone_id: m.id,
    amount: m.labor_budget,
    currency: m.currency,
    // RF-01: the billetera registered on the project, or the fixed profile wallet for projects without one.
    beneficiary_wallet: projectOf(base, m.project_id)?.producer_wallet ?? PRODUCER_BENEFICIARY.walletAddress,
    status: "completado",
    paid_at: at,
  };
  state.payouts.push(receipt);
  state.entries.push({
    id: receipt.receipt_id,
    milestone_id: m.id,
    actor: PLATFORM,
    from_status: "LABOR_PAYOUT_PENDING",
    to_status: "COMPLETED_AND_PAID",
    verdict: "PAYOUT_EXECUTED",
    comments: `Pago confirmado por ${actorId === VERIFIER_PROFILE.id ? "Camila Rojas" : actorId === "platform" ? "la plataforma" : actorId}. Comprobante ${receipt.receipt_id}.`,
    technical_evaluation_json: [],
    subsanaciones: [],
    evidence_snapshot_json: null,
    signature_hash: null,
    created_at: at,
  });
  complete(base, state, m, at, receipt);
  return receipt;
}

export const hasSignedApprovalFor = (state: ReviewsState, m: MilestoneDetailDto): boolean =>
  hasSignedApproval(
    state.entries.filter((e) => e.milestone_id === m.id).map(toReviewEntry),
    assignmentFor(m.project_id).verifier_id,
  );

// ---- seed ----

function satisfy(req: MilestoneDetailDto["required_evidences"][number]): number | boolean | string[] {
  switch (req.type) {
    case "number":
      return req.min ?? 1;
    case "boolean_system_check":
      return true;
    case "photo_array":
      return FIXTURE_PHOTO_URLS.slice(0, Math.max(req.min_items, 1));
  }
}

// Makes sure the verifier has work from the first load, using only documented transitions:
//  1. If fewer than two milestones of the assigned projects are SUBMITTED_FOR_REVIEW, IN_FIELD_EXECUTION milestones get the
//     missing evidence logged and are submitted (the same effect as the producer's "Enviar a revisión").
//  2. TECHNICALLY_APPROVED milestones (fixtures that stop before the payout) get their approval signed by the assigned verifier
//     and move to LABOR_PAYOUT_PENDING with the producer line queued.
export function seedReviews(base: PresalesMockStore, state: ReviewsState) {
  if (state.seededStores.has(base.milestones)) return;
  state.seededStores.add(base.milestones);
  const mine = base.milestones.filter((m) => assignmentFor(m.project_id).verifier_id === VERIFIER_PROFILE.id);

  let reviewable = mine.filter((m) => m.status === "SUBMITTED_FOR_REVIEW").length;
  for (const m of mine.filter((x) => x.status === "IN_FIELD_EXECUTION")) {
    if (reviewable >= 2) break;
    const current = currentFieldData(toMilestoneDetail(m).logs);
    const missing = m.required_evidences.filter((req) => current[req.field_key] === undefined || (req.type === "photo_array" && (current[req.field_key] as string[]).length < req.min_items));
    if (missing.length > 0) {
      m.evidence_logs.push({
        id: `log-seed-${m.id}`,
        milestone_id: m.id,
        log_type: "PHOTO_EVIDENCE",
        notes: "Registro de cierre de la labor en campo.",
        evidence_payload: Object.fromEntries(missing.map((req) => [req.field_key, satisfy(req)])),
        created_at: state.now(),
      });
    }
    m.status = "SUBMITTED_FOR_REVIEW";
    m.reviews.push({ id: state.nextId("rev-seed"), verdict: "SUBMITTED", comment: null, created_at: state.now() });
    reviewable++;
  }

  for (const m of mine.filter((x) => x.status === "TECHNICALLY_APPROVED")) {
    const approval = lastReview(m, ["APPROVED_FAVORABLE"]);
    if (!approval) continue;
    const detail = toMilestoneDetail(m);
    const evaluation = draftEvaluation(detail.requirements, currentFieldData(detail.logs));
    const payload = {
      milestoneId: m.id,
      verifierId: VERIFIER_PROFILE.id,
      verdict: "APPROVED_FAVORABLE",
      comments: approval.comment ?? "Dictamen aprobado.",
      technicalEvaluation: evaluation,
      subsanaciones: [],
    };
    state.entries.push({
      id: approval.id,
      milestone_id: m.id,
      actor: { id: VERIFIER_PROFILE.id, name: VERIFIER_PROFILE.name, role: "VERIFIER" },
      from_status: "SUBMITTED_FOR_REVIEW",
      to_status: "TECHNICALLY_APPROVED",
      verdict: "APPROVED_FAVORABLE",
      comments: payload.comments,
      technical_evaluation_json: evaluation.map((c) => ({ field_key: c.fieldKey, label: c.label, passed: c.passed, observed: c.observed, reason: c.reason })),
      subsanaciones: [],
      evidence_snapshot_json: { log_ids: m.evidence_logs.map((l) => l.id), field_data: currentFieldData(detail.logs) },
      signature_hash: signDictamenFallback(payload),
      created_at: approval.created_at,
    });
    const at = new Date(Date.parse(approval.created_at) + 60_000).toISOString();
    state.entries.push({
      id: state.nextId("rev-sys"),
      milestone_id: m.id,
      actor: PLATFORM,
      from_status: "TECHNICALLY_APPROVED",
      to_status: "LABOR_PAYOUT_PENDING",
      verdict: null,
      comments: "Dictamen aprobado: se solicita el pago de la línea del productor.",
      technical_evaluation_json: [],
      subsanaciones: [],
      evidence_snapshot_json: null,
      signature_hash: null,
      created_at: at,
    });
    m.status = "LABOR_PAYOUT_PENDING";
    state.outbox.push({ id: state.nextId("evt"), type: "PAY_PRODUCER_LINE", milestone_id: m.id, project_id: m.project_id, next_milestone_id: null, amount: m.labor_budget, currency: m.currency, created_at: at });
  }
  syncSubmissionNotifications(base, state);
}
