import { loadProjectAudit } from "../application/use-cases";
import { HttpAuditRepository } from "./http-audit-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the audit trail: binds the use case to one repository over the given transport.
export function createAuditModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpAuditRepository({ baseUrl, fetchFn });
  return {
    loadProjectAudit: (projectId: string) => loadProjectAudit(repo, projectId),
  };
}

export type AuditModule = ReturnType<typeof createAuditModule>;
