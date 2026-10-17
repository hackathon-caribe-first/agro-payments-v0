import {
  getMilestoneDetail,
  listProjectMilestones,
  recordEvidenceFromForm,
  recordEvidenceLog,
  submitForReview,
} from "../application/use-cases";
import { HttpMilestoneRepository } from "./http-milestone-repository";
import { createFixtureStore } from "./mock/fixtures";
import { createMockFetch } from "./mock/mock-fetch";

export type MilestonesSource = "mock" | "http";

interface Options {
  source?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

const DEFAULT_BASE_URL = "/api";

// Composition root: picks the transport and binds the use cases to one repository.
// Only the transport differs between sources; DTO validation and mapping run in both.
export function createMilestonesModule({ source, baseUrl = DEFAULT_BASE_URL, fetchFn }: Options = {}) {
  const resolved: MilestonesSource = source === "http" ? "http" : "mock";
  const transport = fetchFn ?? (resolved === "http" ? (...args: Parameters<typeof fetch>) => fetch(...args) : createMockFetch(createFixtureStore()));
  const repo = new HttpMilestoneRepository({ baseUrl, fetchFn: transport });

  return {
    source: resolved,
    listProjectMilestones: (projectId: string) => listProjectMilestones(repo, projectId),
    getMilestoneDetail: (milestoneId: string) => getMilestoneDetail(repo, milestoneId),
    recordEvidenceLog: (milestoneId: string, rawInput: unknown) => recordEvidenceLog(repo, milestoneId, rawInput),
    recordEvidenceFromForm: (milestoneId: string, form: FormData) => recordEvidenceFromForm(repo, milestoneId, form),
    submitForReview: (milestoneId: string) => submitForReview(repo, milestoneId),
  };
}

export type MilestonesModule = ReturnType<typeof createMilestonesModule>;
