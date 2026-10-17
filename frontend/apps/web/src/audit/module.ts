import { createAuditModule } from "@agro/shared/modules/audit/infrastructure/audit-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// The audit trail is read-only and built from the existing endpoints over the shared transport.
export const audit = createAuditModule({ fetchFn: transport, baseUrl: API_BASE_URL });
