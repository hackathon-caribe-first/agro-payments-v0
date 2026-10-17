import { createTraceModule } from "@agro/shared/modules/trace/infrastructure/trace-module";
import { INVESTOR_PROFILE } from "~/grants/module";
import { API_BASE_URL, prototypeTransport } from "~/platform/transport";

// The trace is derived from grant receipts/events and settlement lines read through the transport (no secrets involved).
// The grants listing is per investor: the seeded investor is traced until an "all grants" operator endpoint exists.
export const trace = createTraceModule({ fetchFn: prototypeTransport, baseUrl: API_BASE_URL, investorIds: [INVESTOR_PROFILE.id] });
