import { createProducerMockStore, type ProducerMockStore } from "../../../projects/infrastructure/mock/store";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { LedgerEntryDto } from "../../../escrow/infrastructure/dto";
import type { SimulationDto } from "../../../simulation/infrastructure/dto";
import type { PaymentAuthorizationDto } from "../../../payment-authorization/infrastructure/dto";
import type { OpenRequestDto, QuoteRequestDto } from "../dto";
import { createExternalProjectFixtures, createLedgerFixtures, createPaymentAuthorizationFixtures, createOpenRequestFixtures, createQuoteRequestFixtures } from "./fixtures";

// Extends the producer store. Spreading keeps the projects and milestones ARRAY REFERENCES, so every handler in the
// transport chain (presales, projects, milestones) mutates and reads the same data.
export interface PresalesMockStore extends ProducerMockStore {
  quoteRequests: QuoteRequestDto[];
  openRequests: OpenRequestDto[];
  // Payment authorizations: appended in place when the buyer authorizes, read by the authorizations mock.
  paymentAuthorizations: PaymentAuthorizationDto[];
  // Escrow ledger (custody): buyer deposits, investor capital, harvest payment, premium, indemnity.
  ledgerEntries: LedgerEntryDto[];
  // Projects of other producers (ids ext-*): served by id only, never listed on the local producer's dashboard.
  externalProjects: ProjectDto[];
  // Motor runs, newest last (the simulation mock appends; the latest one is the project's sheet).
  simulationRuns: SimulationDto[];
}

export const createPresalesMockStore = (): PresalesMockStore => ({
  ...createProducerMockStore(),
  quoteRequests: createQuoteRequestFixtures(),
  openRequests: createOpenRequestFixtures(),
  paymentAuthorizations: createPaymentAuthorizationFixtures(),
  ledgerEntries: createLedgerFixtures(),
  externalProjects: createExternalProjectFixtures(),
  simulationRuns: [],
});
