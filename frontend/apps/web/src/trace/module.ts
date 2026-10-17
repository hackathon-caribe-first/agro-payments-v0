import { createTraceModule } from "@agro/shared/modules/trace/infrastructure/trace-module";
import { INVESTOR_PROFILE } from "~/grants/module";
import { API_BASE_URL, prototypeTransport, transport } from "~/platform/transport";

// Mock mode: the trace is derived from grant receipts/events and settlement lines read through the transport (no secrets involved).
// The grants listing is per investor: the seeded investor is traced until an "all grants" operator endpoint exists.
// Http mode: the screen reads the real payment-steps log (GET /support/payment-steps) through the real transport.
export const trace = createTraceModule({
  fetchFn: prototypeTransport,
  paymentStepsFetchFn: transport,
  baseUrl: API_BASE_URL,
  investorIds: [INVESTOR_PROFILE.id],
});
