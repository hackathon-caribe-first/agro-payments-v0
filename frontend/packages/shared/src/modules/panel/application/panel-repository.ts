import type { InvestorPanel } from "../domain/panel";

export interface PanelIdentity {
  // The id under which the investor holds grants and the id under which the investor negotiates proposals.
  // Both are the same person; the mocks seed them under different ids until authentication exists.
  grantInvestorId: string;
  proposalInvestorId: string;
}

// Port of the investor panel. It only reads: grants, milestone lines, investments and settlements.
export interface PanelRepository {
  loadInvestorPanel(identity: PanelIdentity): Promise<InvestorPanel>;
}
