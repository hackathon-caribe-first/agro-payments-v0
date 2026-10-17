import { createPanelModule } from "@agro/shared/modules/panel/infrastructure/panel-module";
import { INVESTOR_PROFILE as GRANT_INVESTOR } from "~/grants/module";
import { INVESTOR_PROFILE as PROPOSAL_INVESTOR } from "~/investments/module";
import { API_BASE_URL, transport } from "~/platform/transport";

// The panel only reads, through the shared transport: grants, milestone lines, investments and settlements.
// There is no authentication yet: the mocks seed grants and proposals under different investor ids, so both are passed.
const panel = createPanelModule({ fetchFn: transport, baseUrl: API_BASE_URL });

export const investorPanel = {
  load: () => panel.loadInvestorPanel({ grantInvestorId: GRANT_INVESTOR.id, proposalInvestorId: PROPOSAL_INVESTOR.id }),
};

// Panel refresh period (RNF-08: a confirmed payment must show up in under 30 s).
export const PANEL_REFRESH_MS = 10_000;
