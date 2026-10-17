import { createSimulationModule } from "@agro/shared/modules/simulation/infrastructure/simulation-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// The motor's sheet and the publication gate over the same transport as the rest of the app (mock or http).
export const simulation = createSimulationModule({ fetchFn: transport, baseUrl: API_BASE_URL });
