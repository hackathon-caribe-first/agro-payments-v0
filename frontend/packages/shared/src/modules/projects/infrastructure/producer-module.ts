import { HttpMilestoneRepository } from "../../milestones/infrastructure/http-milestone-repository";
import { createMilestonesModule } from "../../milestones/infrastructure/milestones-module";
import { createMockFetch } from "../../milestones/infrastructure/mock/mock-fetch";
import { createProject, getProducerDashboard, getProjectWithMilestones } from "../application/use-cases";
import { HttpProjectRepository } from "./http-project-repository";
import { createProjectsMockFetch } from "./mock/mock-fetch";
import { createProducerMockStore } from "./mock/store";

interface Options {
  source?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

const DEFAULT_BASE_URL = "/api";

// Projects and milestones handlers share the SAME arrays, so created projects resolve everywhere.
function createMockTransport(): typeof fetch {
  const store = createProducerMockStore();
  return createProjectsMockFetch(store, createMockFetch(store.milestones));
}

// Composition root for the producer area: projects and milestones share one transport.
export function createProducerModule({ source, baseUrl = DEFAULT_BASE_URL, fetchFn }: Options = {}) {
  const transport = fetchFn ?? (source === "http" ? (...args: Parameters<typeof fetch>) => fetch(...args) : createMockTransport());

  const milestones = createMilestonesModule({ source, baseUrl, fetchFn: transport });
  const repositories = {
    projects: new HttpProjectRepository({ baseUrl, fetchFn: transport }),
    milestones: new HttpMilestoneRepository({ baseUrl, fetchFn: transport }),
  };

  return {
    milestones,
    getProducerDashboard: () => getProducerDashboard(repositories),
    getProjectWithMilestones: (projectId: string) => getProjectWithMilestones(repositories, projectId),
    createProject: (raw: unknown) => createProject(repositories, raw),
  };
}

export type ProducerModule = ReturnType<typeof createProducerModule>;
