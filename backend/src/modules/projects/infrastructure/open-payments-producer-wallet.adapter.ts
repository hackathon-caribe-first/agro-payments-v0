import { ValidationError } from "../../../shared/domain-errors";
import type { OpenPayments } from "../../milestones/infrastructure/adapters/open-payments.client";
import { PROJECT_CURRENCY } from "../application/project";
import { ProducerWalletCheck } from "../application/producer-wallet";

const refuse = (message: string) => new ValidationError({ producerWalletAddress: [message] }, "Producer wallet rejected");

// RF-01: GET the wallet address; it must exist and hold the project's currency (COP), since lines are paid without FX.
export class OpenPaymentsProducerWalletCheck extends ProducerWalletCheck {
  constructor(private readonly op: OpenPayments) {
    super();
  }

  async verify(walletAddress: string) {
    const wallet = await this.op.client.walletAddress.get({ url: walletAddress }).catch(() => null);
    if (!wallet) throw refuse("No pudimos leer esa billetera. Revisa la dirección.");
    if (wallet.assetCode !== PROJECT_CURRENCY) throw refuse("La billetera no recibe pesos colombianos (COP).");
  }
}

/** Simulated mode: there is no wallet to GET; the https rule in validateNewProject is the whole check. */
export class SimulatedProducerWalletCheck extends ProducerWalletCheck {
  async verify() {}
}
