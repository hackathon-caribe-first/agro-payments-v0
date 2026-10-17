import type { CertifyInput, DeclareInput } from "../domain/harvest";
import { certifyHarvest, confirmReception, declareHarvest, getCustody, getHarvest, getInvestorPanel, listForReview, payHarvest } from "../application/use-cases";
import { HttpHarvestRepository } from "./http-harvest-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the harvest (RF-24), custody (RF-21) and investor panel (RF-27) side.
export function createHarvestModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpHarvestRepository({ baseUrl, fetchFn });
  return {
    get: (projectId: string) => getHarvest(repo, projectId),
    listForReview: () => listForReview(repo),
    declare: (projectId: string, raw: DeclareInput) => declareHarvest(repo, projectId, raw),
    certify: (projectId: string, raw: CertifyInput) => certifyHarvest(repo, projectId, raw),
    pay: (projectId: string) => payHarvest(repo, projectId),
    confirmReception: (projectId: string) => confirmReception(repo, projectId),
    custody: (projectId: string) => getCustody(repo, projectId),
    panel: (projectId: string) => getInvestorPanel(repo, projectId),
  };
}

export type HarvestModule = ReturnType<typeof createHarvestModule>;
