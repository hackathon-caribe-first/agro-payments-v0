import { err, ok } from "../../milestones/domain/errors";
import { attemptOps } from "../../panel/domain/errors";
import type { AuditTimeline } from "../domain/audit";
import { buildAudit } from "../domain/build-audit";
import type { AuditRepository } from "./audit-repository";

// RNF-06: the unified, read-only timeline of a project.
export const loadProjectAudit = (repo: AuditRepository, projectId: string) =>
  attemptOps<AuditTimeline>(async () => {
    const sources = await repo.loadProjectSources(projectId);
    if (!sources) return err({ kind: "not_found" });
    return ok(buildAudit(sources));
  });
