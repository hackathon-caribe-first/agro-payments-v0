import { createInvestmentsModule } from "@agro/shared/modules/investments/infrastructure/investments-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// The investor side over the same transport as the rest of the app. There is no login yet: without a session the API acts as
// the demo investor (DEMO_IDENTITY), and the mock as "investor-capital-verde".
export const investor = createInvestmentsModule({ fetchFn: transport, baseUrl: API_BASE_URL });
