import {
  approveMilestoneGrant,
  denyMilestoneGrant,
  getGrantDetail,
  getProjectGrants,
  listInvestorGrants,
  requestMilestoneGrant,
  revokeMilestoneGrant,
  rotateGrantToken,
  spendOnGrant,
  type InvestorIdentity,
} from "../application/use-cases";
import { HttpGrantRepository } from "./http-grant-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the grants module: binds every use case to one repository over the given transport.
export function createGrantsModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpGrantRepository({ baseUrl, fetchFn });
  return {
    listInvestorGrants: (investorId: string) => listInvestorGrants(repo, investorId),
    getProjectGrants: (projectId: string, investorId: string) => getProjectGrants(repo, projectId, investorId),
    getGrantDetail: (grantId: string) => getGrantDetail(repo, grantId),
    requestMilestoneGrant: (projectId: string, investor: InvestorIdentity, raw: unknown) => requestMilestoneGrant(repo, projectId, investor, raw),
    approveMilestoneGrant: (grantId: string, raw: unknown) => approveMilestoneGrant(repo, grantId, raw),
    denyMilestoneGrant: (grantId: string) => denyMilestoneGrant(repo, grantId),
    rotateGrantToken: (grantId: string) => rotateGrantToken(repo, grantId),
    revokeMilestoneGrant: (grantId: string, raw: unknown) => revokeMilestoneGrant(repo, grantId, raw),
    spendOnGrant: (grantId: string, raw: unknown) => spendOnGrant(repo, grantId, raw),
  };
}

export type GrantsModule = ReturnType<typeof createGrantsModule>;
