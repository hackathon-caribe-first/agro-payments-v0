import { createPaymentAuthorizationModule } from "@agro/shared/modules/payment-authorization/infrastructure/payment-authorization-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// Payment authorizations (read side) over the same transport as the rest of the app.
export const paymentAuthorizations = createPaymentAuthorizationModule({ fetchFn: transport, baseUrl: API_BASE_URL });
