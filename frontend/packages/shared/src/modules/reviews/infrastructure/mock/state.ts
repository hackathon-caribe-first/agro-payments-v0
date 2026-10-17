import type { NotificationDto, OutboxEventDto, PayoutDto, ReviewEntryDto } from "../dto";

// Module-local state of the verification mock. Milestone and project data live in the shared store (by reference);
// only what the review flow adds lives here.
export interface ReviewsState {
  // Immutable audit trail (RNF-06). Decision entries share their id with the review row appended to the milestone.
  entries: ReviewEntryDto[];
  notifications: NotificationDto[];
  // Events for the integrator (grant revocation / next grant / producer payout); nothing else is called from here.
  outbox: OutboxEventDto[];
  payouts: PayoutDto[];
  // Marks the base store as seeded so a second handler over the same store does not seed twice.
  seededStores: WeakSet<object>;
  nextId: (prefix: string) => string;
  // Strictly increasing ISO timestamps: two writes in the same millisecond keep their order.
  now: () => string;
}

export function createReviewsState(): ReviewsState {
  const counters = new Map<string, number>();
  let last = 0;
  return {
    entries: [],
    notifications: [],
    outbox: [],
    payouts: [],
    seededStores: new WeakSet(),
    nextId(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${String(n).padStart(2, "0")}`;
    },
    now() {
      last = Math.max(Date.now(), last + 1);
      return new Date(last).toISOString();
    },
  };
}
