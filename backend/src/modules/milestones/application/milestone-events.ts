// What changed between two versions of a milestone, as domain events (RF-37 notices, RF-35 verifier notice). Pure.
import type { DomainEvent } from "../../../shared/events/domain-events";
import { type EvidenceLog, LINE_STATUS, type Milestone, MILESTONE_STATUS } from "./milestone";

const photoCount = (logs: readonly EvidenceLog[]) =>
  logs.reduce((sum, l) => sum + Object.values(l.evidencePayload).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0), 0);
const lastLocation = (logs: readonly EvidenceLog[]) => logs.findLast((l) => l.attestation?.location)?.attestation?.location ?? null;

export function milestoneEvents(prev: Milestone, next: Milestone): DomainEvent[] {
  const base = { projectId: next.projectId, milestoneId: next.id, milestoneTitle: next.title };
  const events: DomainEvent[] = [];

  for (const log of next.evidenceLogs.slice(prev.evidenceLogs.length)) {
    events.push({ type: "evidence.recorded", ...base, stage: "log", photoCount: photoCount([log]), location: log.attestation?.location ?? null });
  }
  const became = (status: string) => prev.status !== status && next.status === status;
  if (became(MILESTONE_STATUS.EVIDENCE_SUBMITTED)) {
    events.push({ type: "evidence.recorded", ...base, stage: "submitted", photoCount: photoCount(next.evidenceLogs), location: lastLocation(next.evidenceLogs) });
  }
  if (became(MILESTONE_STATUS.OBSERVADO)) events.push({ type: "milestone.observed", ...base, reason: next.review?.reason ?? null });
  if (became(MILESTONE_STATUS.APPROVED)) events.push({ type: "milestone.approved", ...base });

  for (const line of next.lines) {
    const before = prev.lines.find((l) => l.id === line.id);
    if (line.status !== LINE_STATUS.COMPLETADO || before?.status === LINE_STATUS.COMPLETADO) continue;
    events.push({
      type: "line.paid",
      ...base,
      lineId: line.id,
      kind: line.kind,
      beneficiary: line.beneficiary,
      amount: line.amount,
      currency: next.currency,
      assetScale: next.assetScale,
    });
  }
  return events;
}
