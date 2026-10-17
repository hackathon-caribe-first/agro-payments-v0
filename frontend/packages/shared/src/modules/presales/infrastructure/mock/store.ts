import { createProducerMockStore, type ProducerMockStore } from "../../../projects/infrastructure/mock/store";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { PaymentAuthorizationDto } from "../../../payment-authorization/infrastructure/dto";
import type { OpenRequestDto, QuoteRequestDto } from "../dto";
import { createExternalProjectFixtures, createPaymentAuthorizationFixtures, createOpenRequestFixtures, createQuoteRequestFixtures } from "./fixtures";

// Extends the producer store. Spreading keeps the projects and milestones ARRAY REFERENCES, so every handler in the
// transport chain (presales, projects, milestones) mutates and reads the same data.
export interface PresalesMockStore extends ProducerMockStore {
  quoteRequests: QuoteRequestDto[];
  openRequests: OpenRequestDto[];
  // Payment authorizations: appended in place when the buyer authorizes, read by the authorizations mock.
  paymentAuthorizations: PaymentAuthorizationDto[];
  // Projects of other producers (ids ext-*): served by id only, never listed on the local producer's dashboard.
  externalProjects: ProjectDto[];
}

export const createPresalesMockStore = (): PresalesMockStore => ({
  ...createProducerMockStore(),
  quoteRequests: createQuoteRequestFixtures(),
  openRequests: createOpenRequestFixtures(),
  paymentAuthorizations: createPaymentAuthorizationFixtures(),
  externalProjects: createExternalProjectFixtures(),
});
