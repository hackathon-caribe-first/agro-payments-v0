import type {
  GrantDetail,
  InvestorGrantsView,
  MilestoneGrant,
  ProjectGrantsView,
  RevocationReason,
  SpendResult,
  WalletConsent,
} from "../domain/grant";
import type { SpendInput } from "../schemas/grant-inputs";

export interface GrantRequestTarget {
  milestoneId: string;
  investorId: string;
  wallet: string;
}

// Port for milestone grants. Implementations throw BoundaryError, NetworkError, ValidationFailure or GrantConflict.
export interface GrantRepository {
  listInvestorGrants(investorId: string): Promise<InvestorGrantsView>;
  // Null when the project does not exist.
  getProjectGrants(projectId: string, investorId?: string): Promise<ProjectGrantsView | null>;
  // Null when the grant does not exist.
  getGrantDetail(grantId: string): Promise<GrantDetail | null>;
  requestGrant(projectId: string, target: GrantRequestTarget): Promise<MilestoneGrant>;
  // Wallet consent step: the investor approves in the wallet; the wallet answers with interact_ref and hash.
  consentInWallet(grantId: string, accountConfirmed: boolean): Promise<WalletConsent>;
  // Platform side: verify the interaction hash and run grant.continue.
  continueGrant(grantId: string, consent: WalletConsent): Promise<MilestoneGrant>;
  denyGrant(grantId: string): Promise<MilestoneGrant>;
  rotateToken(grantId: string): Promise<MilestoneGrant>;
  revokeGrant(grantId: string, reason: Exclude<RevocationReason, "UNKNOWN">): Promise<MilestoneGrant>;
  spend(grantId: string, input: SpendInput): Promise<SpendResult>;
}
