import { createFixtureStore } from "../../../milestones/infrastructure/mock/fixtures";
import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import type { ProjectDto } from "../dto";
import { createProjectFixtureStore } from "./fixtures";

export interface ProducerMockStore {
  projects: ProjectDto[];
  milestones: MilestoneDetailDto[];
}

// One in-memory store for the whole producer area. Both mock fetch handlers must receive these SAME arrays,
// so a project created through the projects handler is visible to the milestones handler.
export const createProducerMockStore = (): ProducerMockStore => ({
  projects: createProjectFixtureStore(),
  milestones: createFixtureStore(),
});
