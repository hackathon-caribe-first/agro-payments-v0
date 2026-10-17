import { getInvestorBalance, getProducerStatement } from "../application/use-cases";
import { HttpStatementsRepository } from "./http-statements-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the statements: binds each use case to one repository over the given transport.
export function createStatementsModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpStatementsRepository({ baseUrl, fetchFn });
  return {
    getProducerStatement: (projectId: string) => getProducerStatement(repo, projectId),
    getInvestorBalance: (projectId: string) => getInvestorBalance(repo, projectId),
  };
}

export type StatementsModule = ReturnType<typeof createStatementsModule>;
