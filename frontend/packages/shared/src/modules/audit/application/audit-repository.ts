import type { AuditSources } from "../domain/build-audit";

// Port of the audit sources of one project. It only reads: the trail is immutable (RNF-06).
export interface AuditRepository {
  // null when the project does not exist.
  loadProjectSources(projectId: string): Promise<AuditSources | null>;
}
