import { getLatestSheet, listPresets, publishProject, runSimulation } from "../application/use-cases";
import type { RunSimulationInput } from "../domain/sheet";
import { HttpSimulationRepository } from "./http-simulation-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the simulation motor's sheet and the publication gate.
export function createSimulationModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpSimulationRepository({ baseUrl, fetchFn });
  return {
    listPresets: () => listPresets(repo),
    getLatestSheet: (projectId: string) => getLatestSheet(repo, projectId),
    runSimulation: (projectId: string, input: RunSimulationInput) => runSimulation(repo, projectId, input),
    publishProject: (projectId: string) => publishProject(repo, projectId),
  };
}

export type SimulationModule = ReturnType<typeof createSimulationModule>;
