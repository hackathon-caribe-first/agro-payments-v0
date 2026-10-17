import { err, ok } from "../../milestones/domain/errors";
import { attempt } from "../../milestones/application/use-cases";
import type { InvestorProject, Investment } from "../domain/investment";
import { investInputSchema } from "../schemas/invest";
import type { InvestmentRepository } from "./investment-repository";

export const listFundable = (repo: InvestmentRepository) => attempt<InvestorProject[]>(async () => ok(await repo.listFundable()));

/** The investor's project page: the project, its capture bar and the caller's investments (newest first). */
export const getProjectPage = (repo: InvestmentRepository, projectId: string) =>
  attempt<InvestorProject & { investments: Investment[] }>(async () => {
    const page = await repo.getProject(projectId);
    if (!page) return err({ kind: "not_found" });
    const investments = await repo.listInvestments(projectId);
    return ok({ ...page, investments: [...investments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  });

/** raw: { amount, walletAddress } as the form sent them. */
export const invest = (repo: InvestmentRepository, projectId: string, raw: { amount: unknown; walletAddress: unknown }) =>
  attempt<Investment>(async () => {
    const parsed = investInputSchema.safeParse({ amount: raw.amount, wallet_address: raw.walletAddress });
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (fieldErrors[String(issue.path[0])] ??= []).push(issue.message);
      return err({ kind: "validation", fieldErrors });
    }
    return ok(await repo.invest(projectId, parsed.data));
  });
