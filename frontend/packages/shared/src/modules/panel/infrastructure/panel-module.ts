import type { PanelIdentity } from "../application/panel-repository";
import { loadInvestorPanel } from "../application/use-cases";
import { HttpPanelRepository } from "./http-panel-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the investor panel: binds the use case to one repository over the given transport.
export function createPanelModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpPanelRepository({ baseUrl, fetchFn });
  return {
    loadInvestorPanel: (identity: PanelIdentity) => loadInvestorPanel(repo, identity),
  };
}

export type PanelModule = ReturnType<typeof createPanelModule>;
