import { err, ok } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import type { GrantDetail, InvestorGrantsView, MilestoneGrant, ProjectGrantsView, SpendResult } from "../domain/grant";
import { attemptGrant } from "../domain/errors";
import { approveGrantSchema, requestGrantSchema, revokeGrantSchema, spendSchema } from "../schemas/grant-inputs";
import type { GrantRepository } from "./grant-repository";

export interface InvestorIdentity {
  id: string;
  wallet: string;
}

// ---- loaders ----

// Newest first.
export const listInvestorGrants = (repo: GrantRepository, investorId: string) =>
  attemptGrant<InvestorGrantsView>(async () => {
    const view = await repo.listInvestorGrants(investorId);
    return ok({ ...view, grants: [...view.grants].sort((a, b) => b.grant.createdAt.localeCompare(a.grant.createdAt)) });
  });

export const getProjectGrants = (repo: GrantRepository, projectId: string, investorId: string) =>
  attemptGrant<ProjectGrantsView>(async () => {
    const view = await repo.getProjectGrants(projectId, investorId);
    if (!view) return err({ kind: "not_found" });
    return ok({ ...view, milestones: [...view.milestones].sort((a, b) => a.sequenceOrder - b.sequenceOrder) });
  });

// Events and receipts newest first.
export const getGrantDetail = (repo: GrantRepository, grantId: string) =>
  attemptGrant<GrantDetail>(async () => {
    const detail = await repo.getGrantDetail(grantId);
    if (!detail) return err({ kind: "not_found" });
    return ok({
      ...detail,
      events: [...detail.events].sort((a, b) => b.at.localeCompare(a.at)),
      receipts: [...detail.receipts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    });
  });

// ---- actions ----

// RF-05: ask for the grant of one milestone. The server enforces one live grant and the revoke-before-next order.
export const requestMilestoneGrant = (repo: GrantRepository, projectId: string, investor: InvestorIdentity, raw: unknown) =>
  attemptGrant<MilestoneGrant>(async () => {
    const parsed = requestGrantSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await repo.requestGrant(projectId, { milestoneId: parsed.data.milestoneId, investorId: investor.id, wallet: investor.wallet }));
  });

// RF-06: the investor approves in the wallet, then the platform verifies the hash and continues the grant.
export const approveMilestoneGrant = (repo: GrantRepository, grantId: string, raw: unknown) =>
  attemptGrant<MilestoneGrant>(async () => {
    const parsed = approveGrantSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    const consent = await repo.consentInWallet(grantId, true);
    return ok(await repo.continueGrant(grantId, consent));
  });

export const denyMilestoneGrant = (repo: GrantRepository, grantId: string) => attemptGrant<MilestoneGrant>(async () => ok(await repo.denyGrant(grantId)));

// RF-07: manual rotation with the manage_url.
export const rotateGrantToken = (repo: GrantRepository, grantId: string) => attemptGrant<MilestoneGrant>(async () => ok(await repo.rotateToken(grantId)));

// RF-14: grant.cancel for one of the four allowed reasons.
export const revokeMilestoneGrant = (repo: GrantRepository, grantId: string, raw: unknown) =>
  attemptGrant<MilestoneGrant>(async () => {
    const parsed = revokeGrantSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await repo.revokeGrant(grantId, parsed.data.reason));
  });

// Used by the payment flows: pays one line out of the grant. Idempotent by `milestone:line`.
export const spendOnGrant = (repo: GrantRepository, grantId: string, raw: unknown) =>
  attemptGrant<SpendResult>(async () => {
    const parsed = spendSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await repo.spend(grantId, parsed.data));
  });
