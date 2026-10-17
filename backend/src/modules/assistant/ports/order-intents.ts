import type { OrderDecision, OrderIntent } from "../application/order-intents";

// Abstract class (not interface) so it doubles as the Nest DI token. Exported by AssistantModule so the payouts module
// turns confirmed orders into milestone lines without reaching into the assistant's store.
export abstract class OrderIntents {
  /** Confirmed order lines of that milestone, oldest first, whatever their approval. */
  abstract listForMilestone(milestoneId: string): Promise<OrderIntent[]>;
  /** A confirmed order line, or null (unknown id, or not a confirmed order). */
  abstract find(id: string): Promise<OrderIntent | null>;
  /** Records the operator's decision once; DomainError when it was already decided. */
  abstract decide(id: string, decision: OrderDecision): Promise<OrderIntent>;
}
