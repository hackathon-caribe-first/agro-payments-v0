import { DomainError } from "../../../../shared/domain-errors";
import { HarvestPayment } from "../../ports/harvest-payment";

// PAYMENT_GATEWAY=simulated: the harvest payment completes synchronously, like the buyer's deposit. There is never a callback.
export class SimulatedHarvestPayment extends HarvestPayment {
  async start() {
    return null;
  }

  async complete(): Promise<{ reference: string }> {
    throw new DomainError("Simulated harvest payments complete at once: there is no wallet callback to finish");
  }
}
