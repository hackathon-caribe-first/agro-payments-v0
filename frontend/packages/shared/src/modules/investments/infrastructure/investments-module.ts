import { getProjectPage, invest, listFundable } from "../application/use-cases";
import { HttpInvestmentRepository } from "./http-investment-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the investor side.
export function createInvestmentsModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpInvestmentRepository({ baseUrl, fetchFn });
  return {
    listFundable: () => listFundable(repo),
    getProjectPage: (projectId: string) => getProjectPage(repo, projectId),
    invest: (projectId: string, raw: { amount: unknown; walletAddress: unknown }) => invest(repo, projectId, raw),
  };
}

export type InvestmentsModule = ReturnType<typeof createInvestmentsModule>;
