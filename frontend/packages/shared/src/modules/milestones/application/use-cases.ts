import { BoundaryError, NetworkError, ValidationFailure, err, ok, type MilestoneError, type Result } from "../domain/errors";
import type { EvidenceLog, MilestoneDetail, MilestoneSummary } from "../domain/milestone";
import {
  canRecordEvidence,
  canSubmitFromStatus,
  currentFieldData,
  missingRequirements,
} from "../domain/milestone-rules";
import { buildEvidenceLogSchema, parseEvidenceForm, toFieldErrors } from "../schemas/evidence-log";
import type { MilestoneRepository } from "./milestone-repository";

export function toMilestoneError(cause: unknown): MilestoneError {
  if (cause instanceof ValidationFailure) return { kind: "validation", fieldErrors: cause.fieldErrors };
  if (cause instanceof BoundaryError) return { kind: "boundary", message: cause.message };
  if (cause instanceof NetworkError) return { kind: "network", message: cause.message };
  return { kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" };
}

// Repository failures never escape as exceptions: they become typed errors.
export async function attempt<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (cause) {
    return err(toMilestoneError(cause));
  }
}

export const listProjectMilestones = (repo: MilestoneRepository, projectId: string) =>
  attempt<MilestoneSummary[]>(async () => {
    const list = await repo.listByProject(projectId);
    return ok([...list].sort((a, b) => a.sequenceOrder - b.sequenceOrder));
  });

export const getMilestoneDetail = (repo: MilestoneRepository, milestoneId: string) =>
  attempt<MilestoneDetail>(async () => {
    const detail = await repo.getDetail(milestoneId);
    if (!detail) return err({ kind: "not_found" });
    const reviews = [...detail.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok({ ...detail, reviews });
  });

// Guards run before the repository is asked to write anything.
async function recordWithDetail(repo: MilestoneRepository, detail: MilestoneDetail, rawInput: unknown): Promise<Result<EvidenceLog>> {
  if (!canRecordEvidence(detail.status)) return err({ kind: "invalid_transition", status: detail.status });

  const parsed = buildEvidenceLogSchema(detail.requirements).safeParse(rawInput);
  if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });

  return ok(await repo.addEvidenceLog(detail.id, parsed.data));
}

export const recordEvidenceLog = (repo: MilestoneRepository, milestoneId: string, rawInput: unknown) =>
  attempt<EvidenceLog>(async () => {
    const detail = await repo.getDetail(milestoneId);
    if (!detail) return err({ kind: "not_found" });
    return recordWithDetail(repo, detail, rawInput);
  });

// Same flow driven by raw form values: the form is read against the milestone's own requirements.
export const recordEvidenceFromForm = (repo: MilestoneRepository, milestoneId: string, form: FormData) =>
  attempt<EvidenceLog>(async () => {
    const detail = await repo.getDetail(milestoneId);
    if (!detail) return err({ kind: "not_found" });
    return recordWithDetail(repo, detail, {
      logType: form.get("logType"),
      notes: String(form.get("notes") ?? ""),
      evidencePayload: parseEvidenceForm(form, detail.requirements),
    });
  });

export const submitForReview = (repo: MilestoneRepository, milestoneId: string) =>
  attempt<MilestoneDetail>(async () => {
    const detail = await repo.getDetail(milestoneId);
    if (!detail) return err({ kind: "not_found" });
    if (!canSubmitFromStatus(detail.status)) return err({ kind: "invalid_transition", status: detail.status });

    const missing = missingRequirements(detail.requirements, currentFieldData(detail.logs));
    if (missing.length > 0) return err({ kind: "incomplete_requirements", missing });

    return ok(await repo.submitForReview(milestoneId));
  });
