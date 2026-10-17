import { INVESTOR_IDENTITY } from "../../../presales/infrastructure/mock/identities";
import type { PresalesMockStore } from "../../../presales/infrastructure/mock/store";
import { createGrantsApi, createGrantsState, type Reply } from "./state";

// The investor the seeds belong to. The app module uses the same id.
const SEED_INVESTOR = { id: INVESTOR_IDENTITY.id, wallet: INVESTOR_IDENTITY.wallet } as const;

const json = ({ status, body }: Reply) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function readBody(init?: RequestInit): Promise<unknown> {
  if (typeof init?.body !== "string") return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return undefined;
  }
}

// Failure injection understood ONLY by this mock (never sent by the app): `x-mock-fail: network | server | token-expired` makes the
// spend handler fail like a flaky wallet (503) or find an expired token (rotated and retried once, RF-07). Lets scripts prove RF-11.
export const MOCK_FAIL_HEADER = "x-mock-fail";

export function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name)?.[1];
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry ? String(entry[1]) : undefined;
}

// Mock server of the investor grants. Anchored paths, unique prefixes:
//   GET  /investors/:id/grants
//   GET  /projects/:id/grants?investor_id=   POST /projects/:id/grants
//   GET  /grants/:id
//   POST /grants/:id/{interact|continue|deny|spend|rotate-token|revoke}
// Everything else goes to `delegate`. Its own state lives in this closure; `base` is only read, except for the documented
// project/milestone status interplay on the first approved grant (see routes/grant.integration.md).
export function createGrantsMockFetch(base: PresalesMockStore, delegate: typeof fetch): typeof fetch {
  const api = createGrantsApi(createGrantsState(base, SEED_INVESTOR), base);

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    const investorGrants = path.match(/^\/investors\/([^/]+)\/grants$/);
    if (method === "GET" && investorGrants) return json(api.listInvestor(decodeURIComponent(investorGrants[1])));

    const projectGrants = path.match(/^\/projects\/([^/]+)\/grants$/);
    if (projectGrants) {
      const projectId = decodeURIComponent(projectGrants[1]);
      if (method === "GET") return json(api.projectView(projectId, url.searchParams.get("investor_id")));
      if (method === "POST") return json(api.request(projectId, await readBody(init)));
    }

    const detail = path.match(/^\/grants\/([^/]+)$/);
    if (method === "GET" && detail) return json(api.detail(decodeURIComponent(detail[1])));

    const action = path.match(/^\/grants\/([^/]+)\/(interact|continue|deny|spend|rotate-token|revoke)$/);
    if (method === "POST" && action) {
      const id = decodeURIComponent(action[1]);
      switch (action[2]) {
        case "interact":
          return json(api.interact(id, await readBody(init)));
        case "continue":
          return json(api.continueGrant(id, await readBody(init)));
        case "deny":
          return json(api.deny(id));
        case "spend":
          return json(api.spend(id, await readBody(init), headerOf(init, MOCK_FAIL_HEADER)));
        case "rotate-token":
          return json(api.rotateToken(id));
        case "revoke":
          return json(api.revoke(id, await readBody(init)));
      }
    }

    return delegate(input, init);
  };
}
