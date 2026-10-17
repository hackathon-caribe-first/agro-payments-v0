// PRD milestone progress (v3), derived from the one Milestone aggregate. Pure functions: no Nest, no I/O.
//
// Status mapping — the single place it is defined:
//   COMPLETED_AND_PAID    closedAt set (every line final)
//   LABOR_PAYOUT_PENDING  approved and the productor line is en_cola
//   TECHNICALLY_APPROVED  approved, lines still pending
//   SUBMITTED_FOR_REVIEW  evidence_submitted
//   CHANGES_REQUESTED     observado
//   LOCKED                draft and either the project's custody is not funded yet (gate.custodyFunded false: the buyer's
//                         deposit opens the project) or an earlier milestone of the same project is not approved yet
//   SUPPLIES_ORDERED      draft and a proveedor line is en_cola (the supplier payment is in flight)
//   IN_FIELD_EXECUTION    draft, every proveedor line completado and at least one evidence log recorded
//   SUPPLIES_PAID         draft, every proveedor line completado, no log yet
//   ACTIVE                any other draft (open, unfunded or supplies not yet paid)

import { addFieldError, DomainError, type FieldErrors, ValidationError } from "../../../shared/domain-errors";
import {
  type EvidenceAttestation,
  type EvidenceLog,
  type EvidencePayload,
  type EvidenceValue,
  LINE_KIND,
  LINE_STATUS,
  LOG_TYPE,
  type LogType,
  MILESTONE_STATUS,
  type Milestone,
  type Requirement,
  REQUIREMENT_TYPE,
  submitEvidence,
} from "./milestone";

export const PROGRESS_STATUS = {
  LOCKED: "LOCKED",
  ACTIVE: "ACTIVE",
  SUPPLIES_ORDERED: "SUPPLIES_ORDERED",
  SUPPLIES_PAID: "SUPPLIES_PAID",
  IN_FIELD_EXECUTION: "IN_FIELD_EXECUTION",
  SUBMITTED_FOR_REVIEW: "SUBMITTED_FOR_REVIEW",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  TECHNICALLY_APPROVED: "TECHNICALLY_APPROVED",
  LABOR_PAYOUT_PENDING: "LABOR_PAYOUT_PENDING",
  COMPLETED_AND_PAID: "COMPLETED_AND_PAID",
} as const;
export type ProgressStatus = (typeof PROGRESS_STATUS)[keyof typeof PROGRESS_STATUS];

export const NOTES_MAX_LENGTH = 1000;

const EVIDENCE_ALLOWED: ReadonlySet<ProgressStatus> = new Set([
  PROGRESS_STATUS.ACTIVE,
  PROGRESS_STATUS.SUPPLIES_PAID,
  PROGRESS_STATUS.IN_FIELD_EXECUTION,
  PROGRESS_STATUS.CHANGES_REQUESTED,
]);
const SUBMIT_ALLOWED: ReadonlySet<ProgressStatus> = new Set([
  PROGRESS_STATUS.ACTIVE,
  PROGRESS_STATUS.IN_FIELD_EXECUTION,
  PROGRESS_STATUS.CHANGES_REQUESTED,
]);

/** Whether the milestone's project holds its buyer's deposit in custody. Omitted for projectless legacy milestones (never gated). */
export type CustodyGate = { custodyFunded: boolean };

export const canRecordEvidence = (status: ProgressStatus) => EVIDENCE_ALLOWED.has(status);
export const canSubmitForReview = (status: ProgressStatus) => SUBMIT_ALLOWED.has(status);

/** `siblings`: the other milestones of the same project (extra milestones are ignored, so passing more is safe). */
function isLocked(m: Milestone, siblings: readonly Milestone[]) {
  if (m.projectId === null || m.sequenceOrder === null) return false;
  const order = m.sequenceOrder;
  return siblings.some(
    (s) => s.projectId === m.projectId && s.sequenceOrder !== null && s.sequenceOrder < order && s.status !== MILESTONE_STATUS.APPROVED,
  );
}

export function progressStatus(m: Milestone, siblings: readonly Milestone[], gate?: CustodyGate): ProgressStatus {
  if (m.closedAt) return PROGRESS_STATUS.COMPLETED_AND_PAID;
  switch (m.status) {
    case MILESTONE_STATUS.APPROVED:
      return m.lines.some((l) => l.kind === LINE_KIND.PRODUCTOR && l.status === LINE_STATUS.EN_COLA)
        ? PROGRESS_STATUS.LABOR_PAYOUT_PENDING
        : PROGRESS_STATUS.TECHNICALLY_APPROVED;
    case MILESTONE_STATUS.EVIDENCE_SUBMITTED:
      return PROGRESS_STATUS.SUBMITTED_FOR_REVIEW;
    case MILESTONE_STATUS.OBSERVADO:
      return PROGRESS_STATUS.CHANGES_REQUESTED;
    case MILESTONE_STATUS.DRAFT: {
      if (gate?.custodyFunded === false || isLocked(m, siblings)) return PROGRESS_STATUS.LOCKED;
      const supplies = m.lines.filter((l) => l.kind === LINE_KIND.PROVEEDOR);
      if (supplies.some((l) => l.status === LINE_STATUS.EN_COLA)) return PROGRESS_STATUS.SUPPLIES_ORDERED;
      if (supplies.length > 0 && supplies.every((l) => l.status === LINE_STATUS.COMPLETADO)) {
        return m.evidenceLogs.length > 0 ? PROGRESS_STATUS.IN_FIELD_EXECUTION : PROGRESS_STATUS.SUPPLIES_PAID;
      }
      return PROGRESS_STATUS.ACTIVE;
    }
  }
}

export type EvidenceLogInput = Pick<EvidenceLog, "logType" | "notes" | "evidencePayload" | "attestation">;
/** A log as it arrives, before validateEvidenceLog types it against the requirements. */
export type EvidenceLogRequest = { [K in keyof EvidenceLogInput]: unknown };

const LOG_TYPES: readonly string[] = Object.values(LOG_TYPE);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Photos are rendered by the web app, so only http(s) URLs are stored (no javascript:/data: URIs).
const isPhotoUrl = (v: unknown) => {
  if (typeof v !== "string" || !URL.canParse(v)) return false;
  const { protocol } = new URL(v);
  return protocol === "https:" || protocol === "http:";
};

// Same messages as the web app's evidence schema, so a server rejection reads like a client one.
function checkField(req: Requirement, value: unknown, path: string, errors: FieldErrors) {
  switch (req.type) {
    case REQUIREMENT_TYPE.NUMBER:
      if (typeof value !== "number" || !Number.isFinite(value)) return addFieldError(errors, path, "Ingresa un número válido.");
      if (req.min !== undefined && value < req.min) addFieldError(errors, path, `Debe ser como mínimo ${req.min}.`);
      if (req.max !== undefined && value > req.max) addFieldError(errors, path, `Debe ser como máximo ${req.max}.`);
      return;
    case REQUIREMENT_TYPE.BOOLEAN_SYSTEM_CHECK:
      if (typeof value !== "boolean") addFieldError(errors, path, "Indica si la verificación se cumple.");
      return;
    case REQUIREMENT_TYPE.PHOTO_ARRAY:
      if (!Array.isArray(value)) return addFieldError(errors, path, "Adjunta las fotos requeridas.");
      value.forEach((url, i) => isPhotoUrl(url) || addFieldError(errors, `${path}.${i}`, "Cada foto debe ser una URL válida."));
      if (value.length < req.minItems) addFieldError(errors, path, `Adjunta al menos ${req.minItems} fotos.`);
      return;
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const inRange = (v: unknown, limit: number): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;

// RF-19/RF-35: optional; absent (or null) means the log carries no location nor hashes. Each hash names one of the log's photos.
function validateAttestation(raw: unknown, payload: unknown, errors: FieldErrors): EvidenceAttestation | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    addFieldError(errors, "attestation", "La ubicación y las huellas de las fotos no tienen el formato esperado.");
    return undefined;
  }
  let location: EvidenceAttestation["location"] = null;
  if (raw.location !== undefined && raw.location !== null) {
    const l = raw.location;
    if (!isRecord(l) || !inRange(l.latitude, 90) || !inRange(l.longitude, 180)) addFieldError(errors, "attestation.location", "La ubicación no es válida.");
    else location = { latitude: l.latitude, longitude: l.longitude };
  }
  const photos = new Set(isRecord(payload) ? Object.values(payload).flatMap((v) => (Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : [])) : []);
  const hashes = raw.photoHashes ?? [];
  const photoHashes: EvidenceAttestation["photoHashes"] = [];
  if (!Array.isArray(hashes)) {
    addFieldError(errors, "attestation.photoHashes", "Las huellas de las fotos deben ser una lista.");
  } else {
    hashes.forEach((h, i) => {
      const path = `attestation.photoHashes.${i}`;
      const sha256 = isRecord(h) && typeof h.sha256 === "string" ? h.sha256.toLowerCase() : "";
      if (!isRecord(h) || typeof h.url !== "string" || !photos.has(h.url)) return addFieldError(errors, path, "La huella debe corresponder a una foto del registro.");
      if (!SHA256_HEX.test(sha256)) return addFieldError(errors, path, "La huella debe ser un SHA-256 en hexadecimal.");
      if (photoHashes.some((p) => p.url === h.url)) return addFieldError(errors, path, "Esa foto ya tiene huella.");
      photoHashes.push({ url: h.url, sha256 });
    });
  }
  return { location, photoHashes };
}

// Strict, like the web app: every requirement key must be present and no other key is allowed.
export function validateEvidenceLog(requirements: readonly Requirement[], input: EvidenceLogRequest): EvidenceLogInput {
  const errors: FieldErrors = {};
  if (typeof input.logType !== "string" || !LOG_TYPES.includes(input.logType)) addFieldError(errors, "logType", "Selecciona un tipo de registro válido.");
  if (typeof input.notes !== "string") addFieldError(errors, "notes", "Las notas deben ser texto.");
  else if (input.notes.length > NOTES_MAX_LENGTH) addFieldError(errors, "notes", `Máximo ${NOTES_MAX_LENGTH} caracteres.`);
  const payload = input.evidencePayload;
  if (!isRecord(payload)) {
    addFieldError(errors, "evidencePayload", "La evidencia debe ser un objeto.");
  } else {
    for (const req of requirements) checkField(req, payload[req.fieldKey], `evidencePayload.${req.fieldKey}`, errors);
    const known = new Set(requirements.map((r) => r.fieldKey));
    for (const key of Object.keys(payload)) if (!known.has(key)) addFieldError(errors, `evidencePayload.${key}`, "Campo no permitido.");
  }
  const attestation = validateAttestation(input.attestation, payload, errors);
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Evidence payload does not match the milestone requirements");
  return { logType: input.logType as LogType, notes: input.notes as string, evidencePayload: payload as EvidencePayload, ...(attestation && { attestation }) };
}

// 409 for the status first, then 400 for the payload: a closed door is reported before what was carried to it.
export function addEvidenceLog(m: Milestone, siblings: readonly Milestone[], input: EvidenceLogRequest, now: Date, gate?: CustodyGate): Milestone {
  const status = progressStatus(m, siblings, gate);
  if (!canRecordEvidence(status)) throw new DomainError(`Evidence is not accepted in status ${status}`);
  const log: EvidenceLog = { id: `${m.id}-log-${m.evidenceLogs.length + 1}`, ...validateEvidenceLog(m.requirements, input), createdAt: now };
  return { ...m, evidenceLogs: [...m.evidenceLogs, log] };
}

/** Latest value per field key wins, folding logs oldest to newest. */
export function currentFieldData(logs: readonly EvidenceLog[]): EvidencePayload {
  const ordered = [...logs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return Object.assign({}, ...ordered.map((l) => l.evidencePayload)) as EvidencePayload;
}

function isSatisfied(req: Requirement, value: EvidenceValue | undefined) {
  switch (req.type) {
    case REQUIREMENT_TYPE.NUMBER:
      return typeof value === "number" && (req.min === undefined || value >= req.min) && (req.max === undefined || value <= req.max);
    case REQUIREMENT_TYPE.BOOLEAN_SYSTEM_CHECK:
      return value === true;
    case REQUIREMENT_TYPE.PHOTO_ARRAY:
      return Array.isArray(value) && value.length >= req.minItems;
  }
}

export const missingRequirements = (requirements: readonly Requirement[], data: EvidencePayload) =>
  requirements.filter((r) => !isSatisfied(r, data[r.fieldKey])).map((r) => r.fieldKey);

// Reuses the legacy submitEvidence transition, so the verifier's POST /milestones/:id/review keeps working on these milestones.
export function submitForReview(m: Milestone, siblings: readonly Milestone[], now: Date, gate?: CustodyGate): Milestone {
  const status = progressStatus(m, siblings, gate);
  if (!canSubmitForReview(status)) throw new DomainError(`Milestone ${m.id} cannot be submitted for review while ${status}`);
  const missing = missingRequirements(m.requirements, currentFieldData(m.evidenceLogs));
  if (missing.length > 0) throw new DomainError(`Milestone ${m.id} has unmet requirements: ${missing.join(", ")}`);
  const notes = m.evidenceLogs.map((l) => l.notes.trim()).filter(Boolean);
  return submitEvidence(m, notes.length > 0 ? notes.join(" · ") : `Submitted for review with ${m.evidenceLogs.length} evidence log(s)`, now);
}
