import type { StatementSources } from "../domain/statement";

// Port of the statements: it only reads (the statements are documents, never edited).
export interface StatementsRepository {
  // null when the project does not exist.
  loadProjectSources(projectId: string): Promise<StatementSources | null>;
}
