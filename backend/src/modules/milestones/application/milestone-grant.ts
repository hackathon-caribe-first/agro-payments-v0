// RF-13 grant per milestone on the custody wallet. Pure functions: no Nest, no I/O.
// PRD v3 "Grant por hito" rule 7: one live grant per project; milestone N+1's grant is requested only after N's was
// revoked, which happens when N closes approved (RF-22), so "closed" stands for "approved and revoked" here.

import { DomainError } from "../../../shared/domain-errors";
import { PROJECT_STATUS, type ProjectStatus } from "../../projects/application/project";
import type { CustodyStanding } from "../ports/project-custody";
import type { Milestone } from "./milestone";

export const GRANT_STATE = { NONE: "none", ACTIVE: "active", REVOKED: "revoked" } as const;
export type GrantState = (typeof GRANT_STATE)[keyof typeof GRANT_STATE];

// ponytail: derived from the milestone (fundedAt / closedAt). In open-payments mode the GrantStore holds the wallet's truth,
// and a revoke that failed is retried on sync while this already reads revoked.
export const grantState = (m: Pick<Milestone, "fundedAt" | "closedAt">): GrantState =>
  !m.fundedAt ? GRANT_STATE.NONE : m.closedAt ? GRANT_STATE.REVOKED : GRANT_STATE.ACTIVE;

/** `siblings`: milestones of the same project (others are ignored, so passing more is safe). Legacy milestones without a project are never gated. */
export function assertGrantCanStart(m: Milestone, siblings: readonly Milestone[]): void {
  if (m.fundedAt) throw new DomainError(`Milestone ${m.id} is already funded`);
  if (m.closedAt) throw new DomainError(`Milestone ${m.id} is closed`);
  if (m.projectId === null) return;
  const others = siblings.filter((s) => s.projectId === m.projectId && s.id !== m.id);
  const live = others.find((s) => grantState(s) === GRANT_STATE.ACTIVE);
  if (live) throw new DomainError(`Project ${m.projectId} already has a live grant on milestone «${live.title}» (${live.id})`);
  const order = m.sequenceOrder ?? 0;
  const open = others.find((s) => (s.sequenceOrder ?? 0) < order && !s.closedAt);
  if (open) throw new DomainError(`Milestone «${open.title}» (${open.id}) must be approved and its grant revoked before ${m.id} gets one`);
}

// RF-05: custody pays milestones from FUNDED_IN_CUSTODY until the harvest is delivered. Before it (DRAFT, CONTRACT_SIGNED,
// FUNDING_IN_PROGRESS) custody holds nothing to spend; from SETTLEMENT_PROCESSING on it belongs to the liquidation.
const STATUS_ORDER: readonly ProjectStatus[] = Object.values(PROJECT_STATUS);
const between = (s: ProjectStatus, from: ProjectStatus, to: ProjectStatus) =>
  STATUS_ORDER.indexOf(s) >= STATUS_ORDER.indexOf(from) && STATUS_ORDER.indexOf(s) <= STATUS_ORDER.indexOf(to);
export const custodyPaysMilestones = (status: ProjectStatus) => between(status, PROJECT_STATUS.FUNDED_IN_CUSTODY, PROJECT_STATUS.DELIVERED_TO_BUYER);

/** A project milestone's grant needs the project funded in custody and enough custody left for its amount. Legacy milestones are never gated. */
export function assertCustodyCovers(m: Milestone, standing: CustodyStanding | null): void {
  if (m.projectId === null) return;
  if (!standing || !custodyPaysMilestones(standing.status)) {
    throw new DomainError("El proyecto aún no tiene la custodia fondeada: el hito no puede recibir su grant todavía.");
  }
  if (m.amount > standing.available) {
    throw new DomainError("La custodia del proyecto no tiene saldo suficiente para el monto de este hito.");
  }
}
