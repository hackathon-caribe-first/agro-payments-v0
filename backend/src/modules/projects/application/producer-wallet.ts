// RF-01: the producer's wallet is checked before the project exists. Abstract class so it doubles as the DI token.
export abstract class ProducerWalletCheck {
  /** Throws a ValidationError on `producerWalletAddress` when the wallet cannot receive the project's COP. */
  abstract verify(walletAddress: string): Promise<void>;
}
