import { DomainError } from "../../../../shared/domain-errors";
import { LiquidationFunding } from "../../ports/liquidation-funding";

// ponytail: no wallet, so no liquidation grant: simulated payouts run synchronously, as before RF-26's grant existed.
export class SimulatedLiquidationFunding extends LiquidationFunding {
  readonly interactive = false;

  async start(): Promise<{ redirectUrl: string }> {
    throw new DomainError("Simulated mode has no liquidation grant to approve");
  }

  async complete(settlementId: string): Promise<void> {
    throw new DomainError(`Settlement ${settlementId} has no liquidation grant to complete in simulated mode`);
  }

  async ready() {
    return true;
  }

  async revoke() {}
}
