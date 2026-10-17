import { createReconciliationModule } from "@agro/shared/modules/reconciliation/infrastructure/reconciliation-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// INTEGRATION: the mock transport chains createReconciliationMockFetch (packages/shared/.../presales/infrastructure/mock/transport.ts)
// so /reconciliation/** is answered. Against a real backend the same paths are expected.
export const reconciliation = createReconciliationModule({ fetchFn: transport, baseUrl: API_BASE_URL });
