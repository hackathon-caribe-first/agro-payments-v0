import { createMockFetch } from "../../../milestones/infrastructure/mock/mock-fetch";
import { createProjectsMockFetch } from "../../../projects/infrastructure/mock/mock-fetch";
import { createPresalesMockFetch } from "./mock-fetch";
import { createPresalesMockStore } from "./store";

// One mock server for the whole app: presales -> projects -> milestones, all over the same store arrays.
export function createAppMockTransport(): typeof fetch {
  const store = createPresalesMockStore();
  return createPresalesMockFetch(store, createProjectsMockFetch(store, createMockFetch(store.milestones)));
}
