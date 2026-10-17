import { err, ok } from "../../milestones/domain/errors";
import { attemptOps } from "../../panel/domain/errors";
import { buildInvestorBalance, buildProducerStatement, type Statement } from "../domain/statement";
import type { StatementsRepository } from "./statements-repository";

// RF-22: the producer's final statement of a project.
export const getProducerStatement = (repo: StatementsRepository, projectId: string) =>
  attemptOps<Statement>(async () => {
    const sources = await repo.loadProjectSources(projectId);
    return sources ? ok(buildProducerStatement(sources)) : err({ kind: "not_found" });
  });

// RF-22: the investor's balance of a project (partial position until the sale is liquidated).
export const getInvestorBalance = (repo: StatementsRepository, projectId: string) =>
  attemptOps<Statement>(async () => {
    const sources = await repo.loadProjectSources(projectId);
    return sources ? ok(buildInvestorBalance(sources)) : err({ kind: "not_found" });
  });
