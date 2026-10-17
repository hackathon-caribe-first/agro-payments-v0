import { getProjectLedger } from "../application/use-cases";
import { HttpEscrowRepository } from "./http-escrow-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the escrow read side.
export function createEscrowModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpEscrowRepository({ baseUrl, fetchFn });
  return {
    getProjectLedger: (projectId: string) => getProjectLedger(repo, projectId),
  };
}

export type EscrowModule = ReturnType<typeof createEscrowModule>;
