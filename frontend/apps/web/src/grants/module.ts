import { createGrantsModule } from "@agro/shared/modules/grants/infrastructure/grants-module";
import { INVESTOR_IDENTITY } from "@agro/shared/modules/presales/infrastructure/mock/identities";
import type { GrantResult } from "@agro/shared/modules/grants/domain/errors";
import { grantErrorMessage } from "~/components/grant/error-copy";
import { API_BASE_URL, transport } from "~/platform/transport";
import { data } from "react-router";

// INTEGRATION: ~/platform/transport.ts (createAppMockTransport in
// packages/shared/src/modules/presales/infrastructure/mock/transport.ts) must chain createGrantsMockFetch(store, ...) so that
// /grants/**, /investors/:id/grants and /projects/:id/grants are answered. See routes/grant.integration.md.
const grants = createGrantsModule({ fetchFn: transport, baseUrl: API_BASE_URL });

// There is no authentication yet: the investor is a fixed profile. The mock seeds belong to this id.
export const INVESTOR_PROFILE = INVESTOR_IDENTITY;

// Investor-side operations. Every write acts as INVESTOR_PROFILE.
export const investor = {
  listGrants: () => grants.listInvestorGrants(INVESTOR_PROFILE.id),
  getProjectGrants: (projectId: string) => grants.getProjectGrants(projectId, INVESTOR_PROFILE.id),
  getGrantDetail: grants.getGrantDetail,
  requestGrant: (projectId: string, raw: unknown) => grants.requestMilestoneGrant(projectId, INVESTOR_PROFILE, raw),
  approveGrant: grants.approveMilestoneGrant,
  denyGrant: grants.denyMilestoneGrant,
  revokeGrant: grants.revokeMilestoneGrant,
  rotateToken: grants.rotateGrantToken,
  // Called by the payment flows (the platform pays each split line out of the milestone grant).
  spend: grants.spendOnGrant,
};

// Loader helper: not found -> 404 page, anything else -> 502 with the es-CO message.
export function unwrapGrant<T>(result: GrantResult<T>): T {
  if (result.ok) return result.value;
  if (result.error.kind === "not_found") throw data(null, { status: 404 });
  throw new Response(grantErrorMessage(result.error), { status: 502 });
}
