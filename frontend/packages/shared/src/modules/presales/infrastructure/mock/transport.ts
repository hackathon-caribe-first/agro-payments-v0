import { createEscrowMockFetch } from "../../../escrow/infrastructure/mock/mock-fetch";
import { createInvestmentsMockFetch } from "../../../investments/infrastructure/mock/mock-fetch";
import { createMockFetch } from "../../../milestones/infrastructure/mock/mock-fetch";
import { createProjectsMockFetch } from "../../../projects/infrastructure/mock/mock-fetch";
import { createSimulationMockFetch } from "../../../simulation/infrastructure/mock/mock-fetch";
import { createPresalesMockFetch } from "./mock-fetch";
import { createPresalesMockStore } from "./store";

// One mock server for the whole app: investments -> simulation -> presales -> escrow -> projects -> milestones, all over the same store arrays.
export function createAppMockTransport(): typeof fetch {
  const store = createPresalesMockStore();
  return createInvestmentsMockFetch(
    store,
    createSimulationMockFetch(
      store,
      createPresalesMockFetch(store, createEscrowMockFetch(store, createProjectsMockFetch(store, createMockFetch(store.milestones)))),
    ),
  );
}
