import type { Project } from "../domain/project";
import type { CreateProjectInput } from "../domain/project-draft";

// Port for project data. Implementations throw BoundaryError or NetworkError.
export interface ProjectRepository {
  listProducerProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  create(input: CreateProjectInput): Promise<Project>;
}
