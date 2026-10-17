// /api wire bodies → domain inputs. Only the shape is checked here (form-level 400, like the web app's mock server);
// field rules and their messages live in the domain (validateNewProject, validateEvidenceLog) so they key errors by field.
import { addFieldError, type FieldErrors, FORM_LEVEL_KEY, ValidationError } from "../../../shared/domain-errors";
import type { Requirement } from "../../milestones/application/milestone";
import type { EvidenceLogRequest } from "../../milestones/application/milestone-progress";
import type { NewMilestoneInput, NewProjectInput } from "../application/project";

const SHAPE_ERROR = "La solicitud no tiene el formato esperado.";

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const malformed = () => new ValidationError({ [FORM_LEVEL_KEY]: [SHAPE_ERROR] }, "Invalid request shape");
const isOptionalNumber = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v));

function toRequirement(r: unknown): Requirement | null {
  if (!isObject(r) || typeof r.field_key !== "string" || r.field_key === "" || typeof r.label !== "string") return null;
  const base = { fieldKey: r.field_key, label: r.label };
  switch (r.type) {
    case "number":
      if (!isOptionalNumber(r.min) || !isOptionalNumber(r.max)) return null;
      return { ...base, type: "number", ...(r.min !== undefined && { min: r.min as number }), ...(r.max !== undefined && { max: r.max as number }) };
    case "boolean_system_check":
      return { ...base, type: "boolean_system_check" };
    case "photo_array":
      if (typeof r.min_items !== "number" || !Number.isInteger(r.min_items) || r.min_items < 0) return null;
      return { ...base, type: "photo_array", minItems: r.min_items };
    default:
      return null;
  }
}

function toRequirements(schema: Json, path: string, errors: FieldErrors): Requirement[] {
  const parsed = (schema.required_evidences as unknown[]).map(toRequirement);
  const keys = parsed.map((r) => r?.fieldKey);
  if (parsed.some((r) => r === null) || new Set(keys).size !== keys.length) addFieldError(errors, path, "Requisito de evidencia inválido.");
  return parsed.filter((r): r is Requirement => r !== null);
}

const isMilestoneShape = (m: unknown): m is Json =>
  isObject(m) &&
  typeof m.sequence_order === "number" &&
  Number.isInteger(m.sequence_order) &&
  m.sequence_order > 0 &&
  isObject(m.requirements_schema) &&
  Array.isArray(m.requirements_schema.required_evidences);

export function parseCreateProjectRequest(body: unknown): NewProjectInput {
  if (!isObject(body) || !Array.isArray(body.milestones) || !body.milestones.every(isMilestoneShape)) throw malformed();
  const errors: FieldErrors = {};
  // Position after sorting by sequence_order is the milestone's index in error paths, as in the web app.
  const milestones = [...(body.milestones as Json[])]
    .sort((a, b) => (a.sequence_order as number) - (b.sequence_order as number))
    .map(
      (m, i): NewMilestoneInput => ({
        title: m.title as string,
        description: m.description as string,
        estimatedCompletionDate: m.estimated_completion_date as string,
        suppliesBudget: m.supplies_budget as number,
        laborBudget: m.labor_budget as number,
        requirements: toRequirements(m.requirements_schema as Json, `milestones.${i}.requirementsSchema`, errors),
      }),
    );
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid project payload");
  // Field types are left as sent: validateNewProject reports a wrong type on its own field.
  return {
    title: body.title as string,
    description: body.description as string,
    productionType: body.production_type as string,
    startDate: body.start_date as string,
    estimatedEndDate: body.estimated_end_date as string,
    milestones,
    // RF-01, optional: checked in the domain (validateNewProject) and, for the wallet, by GET (ProducerWalletCheck).
    ...(body.plot_polygon !== undefined && body.plot_polygon !== null && { plotPolygon: body.plot_polygon }),
    ...(body.producer_wallet_address !== undefined && body.producer_wallet_address !== null && { producerWalletAddress: body.producer_wallet_address }),
  };
}

export function parseEvidenceLogRequest(body: unknown): EvidenceLogRequest {
  if (!isObject(body)) throw malformed();
  const hasAttestation = (body.location !== undefined && body.location !== null) || body.photo_hashes !== undefined;
  // RF-19/RF-35: location and photo hashes travel as `attestation`; shape and values are checked by validateEvidenceLog.
  const photoHashes = Array.isArray(body.photo_hashes) ? body.photo_hashes : body.photo_hashes === undefined ? [] : body.photo_hashes;
  return {
    logType: body.log_type,
    notes: body.notes,
    evidencePayload: body.evidence_payload,
    ...(hasAttestation && { attestation: { location: body.location ?? null, photoHashes } }),
  };
}
