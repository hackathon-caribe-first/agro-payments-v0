import { DomainError } from "../../../../shared/domain-errors";
import { CustodyDeposit, type DepositResult } from "../../ports/custody-deposit";

// PAYMENT_GATEWAY=simulated: the deposit completes synchronously, exactly like the web app's mock. There is never a callback.
export class SimulatedCustodyDeposit extends CustodyDeposit {
  async start() {
    return null;
  }

  async complete(): Promise<DepositResult> {
    throw new DomainError("Simulated deposits complete at once: there is no wallet callback to finish");
  }

  async confirm() {
    return null;
  }
}
