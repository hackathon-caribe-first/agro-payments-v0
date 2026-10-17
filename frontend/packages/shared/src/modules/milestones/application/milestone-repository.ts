import type { EvidenceLog, MilestoneDetail, MilestoneSummary } from "../domain/milestone";
import type { EvidenceLogInput } from "../schemas/evidence-log";

// Port: the only way the application layer reaches milestone data.
// Implementations throw BoundaryError (malformed data) or NetworkError (transport/server failure).
export interface MilestoneRepository {
  listByProject(projectId: string): Promise<MilestoneSummary[]>;
  getDetail(milestoneId: string): Promise<MilestoneDetail | null>;
  addEvidenceLog(milestoneId: string, input: EvidenceLogInput): Promise<EvidenceLog>;
  submitForReview(milestoneId: string): Promise<MilestoneDetail>;
}
