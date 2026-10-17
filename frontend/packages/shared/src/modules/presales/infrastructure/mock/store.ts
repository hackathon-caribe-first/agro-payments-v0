import { createProducerMockStore, type ProducerMockStore } from "../../../projects/infrastructure/mock/store";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { ListingDto, OpenRequestDto, QuoteRequestDto } from "../dto";
import { createExternalProjectFixtures, createOpenRequestFixtures, createPresaleListingFixtures, createQuoteRequestFixtures } from "./fixtures";

// Extends the producer store. Spreading keeps the projects and milestones ARRAY REFERENCES, so every handler in the
// transport chain (presales, projects, milestones) mutates and reads the same data.
export interface PresalesMockStore extends ProducerMockStore {
  presaleListings: ListingDto[];
  quoteRequests: QuoteRequestDto[];
  openRequests: OpenRequestDto[];
  // Projects of other producers (ids ext-*): served by id only, never listed on the local producer's dashboard.
  externalProjects: ProjectDto[];
}

export const createPresalesMockStore = (): PresalesMockStore => ({
  ...createProducerMockStore(),
  presaleListings: createPresaleListingFixtures(),
  quoteRequests: createQuoteRequestFixtures(),
  openRequests: createOpenRequestFixtures(),
  externalProjects: createExternalProjectFixtures(),
});
