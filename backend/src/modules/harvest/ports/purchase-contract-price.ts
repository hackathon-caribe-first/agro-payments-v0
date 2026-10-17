import type { PriceTerms } from "../domain/harvest";

// Abstract class (not interface) so it doubles as the Nest DI token.
// RF-09 / RF-24: the purchase contract's price terms. Another branch adds purchase contracts; until it is wired the module
// provides none and the verifier's certification request carries the terms (ponytail: the request fallback disappears then).
export abstract class PurchaseContractPrice {
  /** The signed contract's terms for the project, or null without one. */
  abstract termsFor(projectId: string): Promise<PriceTerms | null>;
}
