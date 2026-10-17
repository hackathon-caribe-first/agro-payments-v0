import type { ProjectAdmission } from "../application/admission";

// RF-02/RF-03 assessments, insert-only; the newest per project is its admission. Abstract class doubles as the DI token.
export abstract class AdmissionRepository {
  abstract save(admission: ProjectAdmission): Promise<void>;
  abstract findLatest(projectId: string): Promise<ProjectAdmission | null>;
}
