import type { PaymentAuthorization } from "../domain/authorization";

// Port for payment authorizations. Implementations throw BoundaryError or NetworkError.
export interface PaymentAuthorizationRepository {
  // Null when the project does not exist.
  listProjectAuthorizations(projectId: string): Promise<PaymentAuthorization[] | null>;
}
