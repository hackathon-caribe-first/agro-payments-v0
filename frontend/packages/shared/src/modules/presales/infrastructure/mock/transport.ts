import { createContractsMockFetch } from "../../../contracts/infrastructure/mock/mock-fetch";
import { createEscrowMockFetch } from "../../../escrow/infrastructure/mock/mock-fetch";
import { createGrantsMockFetch } from "../../../grants/infrastructure/mock/mock-fetch";
import { createHarvestMockFetch } from "../../../harvest/infrastructure/mock/mock-fetch";
import { createHarvestMockFetch as createHarvestBatchesMockFetch } from "../../../harvest-batches/infrastructure/mock/mock-fetch";
import { createInvestmentsMockFetch } from "../../../investments/infrastructure/mock/mock-fetch";
import { createInvestmentsMockFetch as createInvestmentProposalsMockFetch } from "../../../investment-proposals/infrastructure/mock/mock-fetch";
import { createMockFetch } from "../../../milestones/infrastructure/mock/mock-fetch";
import { createPaymentAuthorizationMockFetch } from "../../../payment-authorization/infrastructure/mock/mock-fetch";
import { createPaymentLinesMockFetch } from "../../../payment-lines/infrastructure/mock/mock-fetch";
import { createProjectsMockFetch } from "../../../projects/infrastructure/mock/mock-fetch";
import { createReconciliationMockFetch } from "../../../reconciliation/infrastructure/mock/mock-fetch";
import { createReviewsMockFetch } from "../../../reviews/infrastructure/mock/mock-fetch";
import { createSimulationMockFetch } from "../../../simulation/infrastructure/mock/mock-fetch";
import { createEventBridgeMockFetch } from "./event-bridge";
import { createPresalesMockFetch } from "./mock-fetch";
import { createPresalesMockStore } from "./store";

// One mock server for the whole app. Every handler is anchored on its own paths and delegates the rest, over the same store arrays.
// Order, outermost first: bridge -> reconciliation -> harvest -> contracts -> investments -> simulation -> harvest batches ->
// investment proposals -> reviews -> payment lines -> grants -> presales -> escrow -> payment authorizations -> projects -> milestones.
// Reviews must stay OUTSIDE milestones (it reads store.milestones), the bridge outermost so it sees the final responses, and
// investment proposals INNER relative to harvest batches: the settlement reads the signed contract through the delegate.
export function createAppMockTransport(): typeof fetch {
  const store = createPresalesMockStore();
  const core = createPresalesMockFetch(
    store,
    createEscrowMockFetch(store, createPaymentAuthorizationMockFetch(store, createProjectsMockFetch(store, createMockFetch(store.milestones)))),
  );
  const batches = createHarvestBatchesMockFetch(
    store,
    createInvestmentProposalsMockFetch(store, createReviewsMockFetch(store, createPaymentLinesMockFetch(store, createGrantsMockFetch(store, core)))),
  );
  const chained = createHarvestMockFetch(
    store,
    createContractsMockFetch(store, createInvestmentsMockFetch(store, createSimulationMockFetch(store, batches))),
  );
  // Reconciliation derives its rows from grants and settlements, so it wraps the whole chain (read-only over it).
  return createEventBridgeMockFetch(store, createReconciliationMockFetch(chained));
}
