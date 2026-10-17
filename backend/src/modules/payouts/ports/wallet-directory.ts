/** What a wallet address GET answers (Open Payments walletAddress.get), enough to validate a beneficiary. */
export type WalletInfo = { id: string; assetCode: string; assetScale: number };

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class WalletDirectory {
  /** null when the wallet address does not resolve. */
  abstract lookup(walletAddress: string): Promise<WalletInfo | null>;
}
