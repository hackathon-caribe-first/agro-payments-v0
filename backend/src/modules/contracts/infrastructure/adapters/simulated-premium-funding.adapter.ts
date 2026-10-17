import { DomainError } from "../../../../shared/domain-errors";
import { PremiumFunding } from "../../ports/premium-funding";

// ponytail: no wallet, so no premium grant: the simulated gateway pays the premium synchronously.
export class SimulatedPremiumFunding extends PremiumFunding {
  readonly interactive = false;

  async start(): Promise<{ redirectUrl: string }> {
    throw new DomainError("Simulated mode has no premium grant to approve");
  }

  async complete(projectId: string): Promise<void> {
    throw new DomainError(`Project ${projectId} has no premium grant to complete in simulated mode`);
  }

  async ready() {
    return true;
  }

  async revoke() {}
}
