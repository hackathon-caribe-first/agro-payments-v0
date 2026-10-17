import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import type { PresalesMockStore } from "../../../presales/infrastructure/mock/store";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import { estimatedFee, fitsInCap, idempotencyKey } from "../../domain/grant-rules";
import { REVOCATION_REASONS } from "../../domain/grant";
import {
  consentBodyDtoSchema,
  continueBodyDtoSchema,
  requestGrantBodyDtoSchema,
  revokeBodyDtoSchema,
  spendBodyDtoSchema,
  type GrantDto,
  type GrantEventDto,
  type GrantMilestoneDto,
  type GrantProjectDto,
  type SpendEventDto,
} from "../dto";

// Server-side behavior of the grants mock: rules, state and seeds. In-memory, module-local (the shared store is only
// read, except for the documented status interplay on the first approved grant of a project).

export interface Reply {
  status: number;
  body: unknown;
}

export interface GrantsState {
  grants: GrantDto[];
  events: GrantEventDto[];
  receipts: SpendEventDto[];
  // Grants whose access token has "expired": the next payment rotates it once and retries (RF-07).
  expiredTokens: Set<string>;
  seq: number;
}

const reply = (status: number, body: unknown): Reply => ({ status, body });
const conflict = (code: string, message: string, extra: Record<string, unknown> = {}): Reply =>
  reply(409, { error: code, errors: { _form: [message] }, ...extra });
const badRequest = (path: string, message: string): Reply => reply(400, { errors: { [path]: [message] } });
const notFound = (what: string): Reply => reply(404, { error: `${what} not found` });

// ---- hash of the GNAP interaction (RF-06): accepted with and without the trailing slash of the finish URI ----

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const interactHash = (interactRef: string, grantId: string, trailingSlash = false): string =>
  `sha-256:${fnv1a(`${interactRef}|${grantId}${trailingSlash ? "/" : ""}`)}`;

const verifyHash = (interactRef: string, grantId: string, hash: string): boolean =>
  hash === interactHash(interactRef, grantId) || hash === interactHash(interactRef, grantId, true);

// Only a trimmed token is ever shown (RNF-02).
const maskToken = (n: number): string => `gnap_••••••••${String(1000 + ((n * 7919) % 9000))}`;

const nowIso = () => new Date().toISOString();

function nextId(state: GrantsState, prefix: string): string {
  state.seq += 1;
  return `${prefix}-${String(state.seq).padStart(4, "0")}`;
}

function addEvent(
  state: GrantsState,
  grantId: string,
  type: string,
  actor: string,
  detail: GrantEventDto["detail"] = {},
  at: string = nowIso(),
): void {
  // Append-only: events are never edited or removed.
  state.events.push({ id: nextId(state, "evt"), grant_id: grantId, type, actor, at, detail });
}

// ---- lookups over the shared store (read-only) ----

const allProjects = (base: PresalesMockStore): ProjectDto[] => [...base.projects, ...base.externalProjects];
const budgetOf = (m: MilestoneDetailDto): number => m.supplies_budget + m.labor_budget;

const projectRef = (p: ProjectDto): GrantProjectDto => ({ id: p.id, title: p.title, currency: p.currency });
const milestoneRef = (m: MilestoneDetailDto): GrantMilestoneDto => ({
  id: m.id,
  sequence_order: m.sequence_order,
  title: m.title,
  status: m.status,
  budget: budgetOf(m),
  estimated_completion_date: m.estimated_completion_date ?? null,
});

// ---- seeds ----

interface SeedLine {
  id: string;
  concept: string;
  beneficiary: string;
  wallet: string;
  received: number;
  at: string;
}

function seedReceipts(state: GrantsState, grant: GrantDto, lines: SeedLine[]): void {
  for (const line of lines) {
    const fee = estimatedFee(grant.currency);
    const debited = line.received + fee;
    const before = grant.spent;
    grant.spent = before + debited;
    state.receipts.push({
      id: nextId(state, "rcpt"),
      grant_id: grant.id,
      idempotency_key: idempotencyKey(grant.milestone_id, line.id),
      line_id: line.id,
      concept: line.concept,
      beneficiary: line.beneficiary,
      beneficiary_wallet: line.wallet,
      received: line.received,
      fee,
      debited,
      spent_before: before,
      spent_after: grant.spent,
      incoming_payment_id: `${line.wallet}/incoming-payments/${state.seq.toString(16).padStart(8, "0")}-a1c4`,
      outgoing_payment_id: `${grant.wallet}/outgoing-payments/${state.seq.toString(16).padStart(8, "0")}-7e92`,
      created_at: line.at,
    });
    addEvent(
      state,
      grant.id,
      "PAYMENT_CONFIRMED",
      "PLATFORM",
      { line: line.id, concept: line.concept, debited, spent_after: grant.spent },
      line.at,
    );
  }
}

function baseGrant(state: GrantsState, base: PresalesMockStore, milestoneId: string, investor: { id: string; wallet: string }, createdAt: string): GrantDto | null {
  const milestone = base.milestones.find((m) => m.id === milestoneId);
  const project = milestone ? allProjects(base).find((p) => p.id === milestone.project_id) : undefined;
  if (!milestone || !project) return null;
  const grant: GrantDto = {
    id: nextId(state, `grant-${milestone.id}`),
    project_id: project.id,
    milestone_id: milestone.id,
    investor_id: investor.id,
    wallet: investor.wallet,
    cap_amount: budgetOf(milestone),
    currency: milestone.currency,
    spent: 0,
    status: "PENDING_APPROVAL",
    interact_ref: null,
    hash_state: "PENDING",
    token_masked: null,
    created_at: createdAt,
    approved_at: null,
    revoked_at: null,
    revocation_reason: null,
    revocation: null,
  };
  state.grants.push(grant);
  addEvent(state, grant.id, "REQUESTED", "PLATFORM", { cap: grant.cap_amount, wallet: grant.wallet, interval: null }, createdAt);
  return grant;
}

function approveSeed(state: GrantsState, grant: GrantDto, at: string): void {
  const ref = `ref-${grant.id.slice(-4)}`;
  grant.interact_ref = ref;
  grant.hash_state = "VERIFIED";
  grant.status = "ACTIVE";
  grant.approved_at = at;
  grant.token_masked = maskToken(state.seq);
  addEvent(state, grant.id, "APPROVAL_RECEIVED", "WALLET", { interact_ref: ref }, at);
  addEvent(state, grant.id, "HASH_VERIFIED", "PLATFORM", { hash: interactHash(ref, grant.id) }, at);
  addEvent(state, grant.id, "TOKEN_STORED", "PLATFORM", { stored: "token, manage_url y continue.uri cifrados" }, at);
}

function revokeGrantState(state: GrantsState, grant: GrantDto, reason: string, at: string): void {
  grant.status = "REVOKED";
  grant.revoked_at = at;
  grant.revocation_reason = reason;
  grant.token_masked = null;
  grant.revocation = {
    cap: grant.cap_amount,
    spent: grant.spent,
    remaining_in_wallet: grant.cap_amount - grant.spent,
    delete_response_status: 204,
  };
  state.expiredTokens.delete(grant.id);
  addEvent(state, grant.id, "REVOKED", "PLATFORM", { reason, delete_status: 204, tokens_deleted: true }, at);
  // A later payment must be rejected: the platform probes it and records the answer.
  addEvent(state, grant.id, "REVOCATION_VERIFIED", "PLATFORM", { later_payment_rejected: true, probe_status: 403 }, at);
}

export function createGrantsState(base: PresalesMockStore, investor: { id: string; wallet: string }): GrantsState {
  const state: GrantsState = { grants: [], events: [], receipts: [], expiredTokens: new Set(), seq: 0 };

  // Plátano · hito 1: active, two lines paid, the token already expired (the next payment rotates it).
  const active = baseGrant(state, base, "ms-41", investor, "2026-10-08T14:02:00.000Z");
  if (active) {
    approveSeed(state, active, "2026-10-08T14:06:00.000Z");
    seedReceipts(state, active, [
      { id: "L1", concept: "Plántulas y drenajes · factura F-118", beneficiary: "Vivero Llanos del Meta", wallet: "https://wallet.example/vivero-meta", received: 2400000, at: "2026-10-10T16:20:00.000Z" },
      { id: "L2", concept: "Transporte de insumos · orden T-07", beneficiary: "Transportes Ariari", wallet: "https://wallet.example/transportes-ariari", received: 350000, at: "2026-10-13T11:45:00.000Z" },
    ]);
    addEvent(state, active.id, "TOKEN_ROTATED", "PLATFORM", { reason: "inactive_token", retried: true }, "2026-10-13T11:45:00.000Z");
    state.expiredTokens.add(active.id);
  }

  // Panela · hito 1: closed with its revocation proof; 150,000 never left the wallet.
  const revoked = baseGrant(state, base, "ms-31", investor, "2026-08-05T10:00:00.000Z");
  if (revoked) {
    approveSeed(state, revoked, "2026-08-05T10:08:00.000Z");
    seedReceipts(state, revoked, [
      { id: "L1", concept: "Semilla y herramientas · factura F-044", beneficiary: "Agroinsumos Útica", wallet: "https://wallet.example/agroinsumos-utica", received: 4200000, at: "2026-08-12T15:00:00.000Z" },
      { id: "L2", concept: "Mano de obra del hito", beneficiary: "Productor de panela orgánica", wallet: "https://wallet.example/productor-panela", received: 2450000, at: "2026-08-27T17:30:00.000Z" },
    ]);
    revokeGrantState(state, revoked, "LAST_LINE_CONFIRMED", "2026-08-27T17:31:00.000Z");
  }

  // Cacao · hito 1: requested, waiting for the investor to approve in the wallet.
  baseGrant(state, base, "ms-11", investor, "2026-10-16T09:30:00.000Z");

  return state;
}

// ---- views ----

function viewOf(base: PresalesMockStore, grant: GrantDto) {
  const project = allProjects(base).find((p) => p.id === grant.project_id);
  const milestone = base.milestones.find((m) => m.id === grant.milestone_id);
  if (!project || !milestone) return null;
  return { grant, project: projectRef(project), milestone: milestoneRef(milestone) };
}

// ---- rules ----

// Moves the project to "Cotización aprobada" (FUNDED_IN_CUSTODY on the wire) and unlocks milestone 1 on the first approved grant.
function applyFirstApprovalInterplay(base: PresalesMockStore, grant: GrantDto): void {
  const project = base.projects.find((p) => p.id === grant.project_id);
  const first = base.milestones.find((m) => m.project_id === grant.project_id && m.sequence_order === 1);
  if (!project || !first || first.id !== grant.milestone_id) return;
  if (project.current_status === "FUNDING_IN_PROGRESS") project.current_status = "FUNDED_IN_CUSTODY";
  if (first.status === "LOCKED") first.status = "ACTIVE";
}

function rotate(state: GrantsState, grant: GrantDto, reason: string, retried: boolean): void {
  grant.token_masked = maskToken(state.seq + 1);
  state.expiredTokens.delete(grant.id);
  addEvent(state, grant.id, "TOKEN_ROTATED", "PLATFORM", { reason, retried });
}

function liveOrClosedBlock(state: GrantsState, base: PresalesMockStore, body: { milestone_id: string; investor_id: string }): Reply | null {
  const milestone = base.milestones.find((m) => m.id === body.milestone_id);
  if (!milestone) return null;
  const mine = state.grants.filter((g) => g.milestone_id === milestone.id && g.investor_id === body.investor_id);
  if (mine.some((g) => g.status === "PENDING_APPROVAL" || g.status === "ACTIVE")) {
    return conflict("LIVE_GRANT_EXISTS", "Este hito ya tiene un grant vigente.");
  }
  if (mine.some((g) => g.status === "REVOKED") || milestone.status === "COMPLETED_AND_PAID") {
    return conflict("MILESTONE_CLOSED", "El grant de este hito ya se cerró: no admite uno nuevo.");
  }
  const earlier = base.milestones.filter((m) => m.project_id === milestone.project_id && m.sequence_order < milestone.sequence_order);
  const pending = earlier.find((m) => {
    const theirs = state.grants.filter((g) => g.milestone_id === m.id && g.investor_id === body.investor_id);
    if (theirs.some((g) => g.status === "REVOKED")) return false;
    // A milestone already paid before grants existed does not hold the next one back.
    return !(m.status === "COMPLETED_AND_PAID" && !theirs.some((g) => g.status === "PENDING_APPROVAL" || g.status === "ACTIVE"));
  });
  if (pending) return conflict("PREVIOUS_GRANT_NOT_REVOKED", `Primero debe revocarse el grant del hito ${pending.sequence_order}.`);
  return null;
}

// ---- handlers ----

export interface GrantsApi {
  listInvestor(investorId: string): Reply;
  projectView(projectId: string, investorId: string | null): Reply;
  detail(grantId: string): Reply;
  request(projectId: string, raw: unknown): Reply;
  interact(grantId: string, raw: unknown): Reply;
  continueGrant(grantId: string, raw: unknown): Reply;
  deny(grantId: string): Reply;
  rotateToken(grantId: string): Reply;
  revoke(grantId: string, raw: unknown): Reply;
  // `inject` is the mock-only failure injection (`x-mock-fail`).
  spend(grantId: string, raw: unknown, inject?: string): Reply;
}

export function createGrantsApi(state: GrantsState, base: PresalesMockStore): GrantsApi {
  const find = (id: string) => state.grants.find((g) => g.id === id);

  // Pending grants only: anything else answers with the matching conflict.
  const requirePending = (grant: GrantDto): Reply | null =>
    grant.status === "PENDING_APPROVAL" ? null : conflict("NOT_PENDING_APPROVAL", "Este grant ya no está pendiente de aprobación.");

  // Active grants only; a revoked one answers GRANT_REVOKED so a later payment is distinguishable from a token problem.
  const requireActive = (grant: GrantDto): Reply | null => {
    if (grant.status === "ACTIVE") return null;
    if (grant.status === "REVOKED") return conflict("GRANT_REVOKED", "El grant fue revocado: no admite más pagos.");
    return conflict("NOT_ACTIVE", "El grant todavía no está activo.");
  };

  return {
    listInvestor(investorId) {
      const grants = state.grants.filter((g) => g.investor_id === investorId).flatMap((g) => viewOf(base, g) ?? []);
      // Only the projects the investor can act on: a signed contract waiting for its first grant, or at least one grant already.
      const awaitingGrant = (p: ProjectDto) => p.current_status === "CONTRACT_SIGNED" || p.current_status === "FUNDING_IN_PROGRESS";
      const projects = allProjects(base)
        .filter((p) => base.milestones.some((m) => m.project_id === p.id))
        .filter((p) => awaitingGrant(p) || state.grants.some((g) => g.project_id === p.id && g.investor_id === investorId))
        .map(projectRef);
      return reply(200, { grants, projects });
    },

    projectView(projectId, investorId) {
      const project = allProjects(base).find((p) => p.id === projectId);
      if (!project) return notFound("Project");
      const milestones = base.milestones.filter((m) => m.project_id === projectId).map(milestoneRef);
      const grants = state.grants.filter((g) => g.project_id === projectId && (!investorId || g.investor_id === investorId));
      return reply(200, { project: projectRef(project), milestones, grants });
    },

    detail(grantId) {
      const grant = find(grantId);
      if (!grant) return notFound("Grant");
      const view = viewOf(base, grant);
      if (!view) return notFound("Grant");
      return reply(200, {
        ...view,
        events: state.events.filter((e) => e.grant_id === grantId),
        receipts: state.receipts.filter((r) => r.grant_id === grantId),
      });
    },

    request(projectId, raw) {
      const parsed = requestGrantBodyDtoSchema.safeParse(raw);
      if (!parsed.success) return badRequest("_form", "La solicitud del grant no es válida.");
      const project = allProjects(base).find((p) => p.id === projectId);
      if (!project) return notFound("Project");
      const milestone = base.milestones.find((m) => m.id === parsed.data.milestone_id && m.project_id === projectId);
      if (!milestone) return badRequest("milestoneId", "El hito no pertenece a este proyecto.");
      const blocked = liveOrClosedBlock(state, base, parsed.data);
      if (blocked) return blocked;
      const grant = baseGrant(state, base, milestone.id, { id: parsed.data.investor_id, wallet: parsed.data.wallet }, nowIso());
      return grant ? reply(201, grant) : notFound("Milestone");
    },

    // Wallet consent: what the wallet answers when the investor approves (interact_ref + hash).
    interact(grantId, raw) {
      const grant = find(grantId);
      if (!grant) return notFound("Grant");
      const parsed = consentBodyDtoSchema.safeParse(raw);
      if (!parsed.success) return badRequest("_form", "La aprobación no es válida.");
      const pending = requirePending(grant);
      if (pending) return pending;
      // PoC lesson: a browser signed in with another account gets "Access to the given resource is forbidden".
      if (!parsed.data.account_confirmed) {
        return conflict("WALLET_ACCOUNT_MISMATCH", "Access to the given resource is forbidden");
      }
      const ref = `ref-${nextId(state, "int")}`;
      grant.interact_ref = ref;
      addEvent(state, grant.id, "APPROVAL_RECEIVED", "WALLET", { interact_ref: ref });
      return reply(200, { interact_ref: ref, hash: interactHash(ref, grant.id) });
    },

    // grant.continue: verify the interaction hash, then keep the (encrypted) token and URLs.
    continueGrant(grantId, raw) {
      const grant = find(grantId);
      if (!grant) return notFound("Grant");
      const parsed = continueBodyDtoSchema.safeParse(raw);
      if (!parsed.success) return badRequest("_form", "La verificación no es válida.");
      const pending = requirePending(grant);
      if (pending) return pending;
      if (grant.interact_ref !== parsed.data.interact_ref || !verifyHash(parsed.data.interact_ref, grant.id, parsed.data.hash)) {
        grant.hash_state = "MISMATCH";
        addEvent(state, grant.id, "HASH_MISMATCH", "PLATFORM", { received: parsed.data.hash });
        return conflict("HASH_MISMATCH", "No pudimos verificar la aprobación de la billetera.");
      }
      grant.hash_state = "VERIFIED";
      grant.status = "ACTIVE";
      grant.approved_at = nowIso();
      grant.token_masked = maskToken(state.seq + 1);
      addEvent(state, grant.id, "HASH_VERIFIED", "PLATFORM", { hash: parsed.data.hash });
      addEvent(state, grant.id, "TOKEN_STORED", "PLATFORM", { stored: "token, manage_url y continue.uri cifrados" });
      applyFirstApprovalInterplay(base, grant);
      return reply(200, grant);
    },

    deny(grantId) {
      const grant = find(grantId);
      if (!grant) return notFound("Grant");
      const pending = requirePending(grant);
      if (pending) return pending;
      grant.status = "DENIED";
      addEvent(state, grant.id, "DENIED", "INVESTOR", { reason: "wallet_consent_rejected" });
      return reply(200, grant);
    },

    rotateToken(grantId) {
      const grant = find(grantId);
      if (!grant) return notFound("Grant");
      const inactive = requireActive(grant);
      if (inactive) return inactive;
      rotate(state, grant, "manual_rotation", false);
      return reply(200, grant);
    },

    revoke(grantId, raw) {
      const grant = find(grantId);
      if (!grant) return notFound("Grant");
      const parsed = revokeBodyDtoSchema.safeParse(raw);
      if (!parsed.success || !(REVOCATION_REASONS as readonly string[]).includes(parsed.data.reason)) {
        return badRequest("reason", "Elige el motivo de la revocación.");
      }
      const inactive = requireActive(grant);
      if (inactive) return inactive;
      revokeGrantState(state, grant, parsed.data.reason, nowIso());
      return reply(200, grant);
    },

    // Pays one split line out of the grant. Idempotent by `milestone:line` (RF-11).
    spend(grantId, raw, inject) {
      const grant = find(grantId);
      if (!grant) return notFound("Grant");
      const parsed = spendBodyDtoSchema.safeParse(raw);
      if (!parsed.success) return badRequest("_form", "El pago no es válido.");
      const input = parsed.data;
      const key = idempotencyKey(grant.milestone_id, input.line_id);

      // A repeated key returns the existing receipt, even after revocation: it never creates a second payment.
      const existing = state.receipts.find((r) => r.idempotency_key === key);
      if (existing) return reply(200, { receipt: existing, replayed: true });

      const inactive = requireActive(grant);
      if (inactive) return inactive;

      // Mock-only failure injection. A flaky wallet answers 503 and nothing is paid (so a retry is safe); an expired token is
      // handled below like the seeded one.
      if (inject === "token-expired") state.expiredTokens.add(grant.id);
      if (inject === "network" || inject === "server") {
        const code = inject === "network" ? "NETWORK_ERROR" : "SERVER_ERROR";
        addEvent(state, grant.id, "PAYMENT_FAILED", "PLATFORM", { line: input.line_id, concept: input.concept, code, status: 503 });
        return reply(503, { error: code, errors: { _form: ["La billetera no respondió. El pago no se realizó."] } });
      }

      // RF-07: an expired token is rotated with the manage_url and the call retried once.
      if (state.expiredTokens.has(grant.id)) rotate(state, grant, "inactive_token", true);

      const fee = input.fee ?? estimatedFee(grant.currency);
      const debited = input.received + fee;
      const remaining = Math.max(0, grant.cap_amount - grant.spent);
      if (!fitsInCap({ capAmount: grant.cap_amount, spent: grant.spent }, debited)) {
        addEvent(state, grant.id, "PAYMENT_REJECTED", "PLATFORM", { line: input.line_id, concept: input.concept, code: "GRANT_LIMIT_EXCEEDED", debited, remaining });
        return conflict("GRANT_LIMIT_EXCEEDED", "El pago no cabe en lo que queda del tope del grant.", { remaining });
      }

      const before = grant.spent;
      grant.spent = before + debited;
      const suffix = nextId(state, "pay").slice(-4);
      const receipt: SpendEventDto = {
        id: nextId(state, "rcpt"),
        grant_id: grant.id,
        idempotency_key: key,
        line_id: input.line_id,
        concept: input.concept,
        beneficiary: input.beneficiary,
        beneficiary_wallet: input.beneficiary_wallet,
        received: input.received,
        fee,
        debited,
        spent_before: before,
        spent_after: grant.spent,
        incoming_payment_id: `${input.beneficiary_wallet}/incoming-payments/${suffix}-b3d1`,
        outgoing_payment_id: `${grant.wallet}/outgoing-payments/${suffix}-c8f5`,
        created_at: nowIso(),
      };
      state.receipts.push(receipt);
      addEvent(state, grant.id, "PAYMENT_CONFIRMED", "PLATFORM", { line: input.line_id, concept: input.concept, debited, spent_after: grant.spent });
      return reply(201, { receipt, replayed: false });
    },
  };
}
