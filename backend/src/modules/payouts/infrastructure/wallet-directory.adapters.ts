import { Logger } from "@nestjs/common";
import type { OpenPayments } from "../../milestones/infrastructure/adapters/open-payments.client";
import { type WalletInfo, WalletDirectory } from "../ports/wallet-directory";

// RF-15: a GET of the wallet address (public, no grant) proves it exists and tells its asset.
export class OpenPaymentsWalletDirectory extends WalletDirectory {
  private readonly logger = new Logger(OpenPaymentsWalletDirectory.name);

  constructor(private readonly op: OpenPayments) {
    super();
  }

  async lookup(walletAddress: string): Promise<WalletInfo | null> {
    try {
      const { id, assetCode, assetScale } = await this.op.client.walletAddress.get({ url: walletAddress });
      return { id, assetCode, assetScale };
    } catch (error) {
      this.logger.warn(`Wallet ${walletAddress} did not resolve: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}

// ponytail: no network in simulated mode, so every https wallet "resolves" in COP/2, like the simulated gateway pays any wallet.
export class SimulatedWalletDirectory extends WalletDirectory {
  async lookup(walletAddress: string): Promise<WalletInfo | null> {
    return { id: walletAddress, assetCode: "COP", assetScale: 2 };
  }
}
