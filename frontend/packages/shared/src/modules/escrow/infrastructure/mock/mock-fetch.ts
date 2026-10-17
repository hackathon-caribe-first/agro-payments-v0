import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { LedgerEntryDto } from "../dto";

// The slice of the shared mock store the ledger read side needs (the same arrays the other handlers use).
export interface EscrowMockStore {
  ledgerEntries: LedgerEntryDto[];
  projects: ProjectDto[];
  externalProjects: ProjectDto[];
  milestones: MilestoneDetailDto[];
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// GET /projects/:id/escrow-ledger only. The anchored regex never matches /projects/:id or /projects/:id/milestones.
export function createEscrowMockFetch(store: EscrowMockStore, delegate: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    const ledger = path.match(/^\/projects\/([^/]+)\/escrow-ledger$/);
    if (method === "GET" && ledger) {
      const id = ledger[1];
      const known = [...store.projects, ...store.externalProjects].some((p) => p.id === id);
      if (!known) return json({ error: "Project not found" }, 404);
      return json(store.ledgerEntries.filter((e) => e.project_id === id));
    }

    return delegate(input, init);
  };
}
