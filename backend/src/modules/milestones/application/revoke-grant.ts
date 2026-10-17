import { Logger } from "@nestjs/common";
import type { MilestoneFunding } from "../ports/milestone-funding";
import { grantRevocable, type Milestone } from "./milestone";

const logger = new Logger("RevokeGrant");

// RF-22, called after the milestone is saved: a failed revoke never undoes the closed state.
// It stays retryable: every sync of a closed milestone tries again, and funding.revoke() is idempotent.
// ponytail: retried only on operator sync; add a background sweep if closed milestones with active grants pile up.
export async function revokeIfClosed(funding: MilestoneFunding, milestone: Milestone): Promise<void> {
  if (!grantRevocable(milestone)) return;
  try {
    await funding.revoke(milestone.id);
  } catch (error) {
    // Message only: grant tokens never reach errors or logs.
    logger.warn(`Revoking the grant of ${milestone.id} failed, will retry on sync: ${error instanceof Error ? error.message : String(error)}`);
  }
}
