import { createPaymentAuthorizationMockFetch } from "../../../payment-authorization/infrastructure/mock/mock-fetch";
import { createGrantsMockFetch } from "../../../grants/infrastructure/mock/mock-fetch";
import { createHarvestMockFetch } from "../../../harvest/infrastructure/mock/mock-fetch";
import { createInvestmentsMockFetch } from "../../../investments/infrastructure/mock/mock-fetch";
import { createMockFetch } from "../../../milestones/infrastructure/mock/mock-fetch";
import { createPaymentLinesMockFetch } from "../../../payment-lines/infrastructure/mock/mock-fetch";
import { createProjectsMockFetch } from "../../../projects/infrastructure/mock/mock-fetch";
import { createReconciliationMockFetch } from "../../../reconciliation/infrastructure/mock/mock-fetch";
import { createReviewsMockFetch } from "../../../reviews/infrastructure/mock/mock-fetch";
import { createEventBridgeMockFetch } from "./event-bridge";
import { createPresalesMockFetch } from "./mock-fetch";
import { createPresalesMockStore } from "./store";

// One mock server for the whole app. Every handler is anchored on its own paths and delegates the rest, over the same store arrays.
// Order, outermost first: bridge -> reconciliation -> harvest -> investments -> reviews -> payment lines -> grants -> presales -> payment authorizations -> projects -> milestones.
// Reviews must stay OUTSIDE milestones (it reads store.milestones), the bridge outermost so it sees the final responses, and
// investments INNER relative to harvest: the settlement reads the signed contract through harvest's delegate.
export function createAppMockTransport(): typeof fetch {
  const store = createPresalesMockStore();
  const core = createPresalesMockFetch(store, createPaymentAuthorizationMockFetch(store, createProjectsMockFetch(store, createMockFetch(store.milestones))));
  const chained = createHarvestMockFetch(
    store,
    createInvestmentsMockFetch(store, createReviewsMockFetch(store, createPaymentLinesMockFetch(store, createGrantsMockFetch(store, core)))),
  );
  // Reconciliation derives its rows from grants and settlements, so it wraps the whole chain (read-only over it).
  return createEventBridgeMockFetch(store, createReconciliationMockFetch(chained));
}
