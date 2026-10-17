import { createEscrowModule } from "@agro/shared/modules/escrow/infrastructure/escrow-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// The escrow ledger (read side) over the same transport as the rest of the app.
export const escrow = createEscrowModule({ fetchFn: transport, baseUrl: API_BASE_URL });
