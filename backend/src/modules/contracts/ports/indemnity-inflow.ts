export type IndemnityOrder = { claimId: string; projectId: string; amount: number; currency: string; assetScale: number };

// Abstract class (not interface) so it doubles as the Nest DI token.
// RF-25 / request #26: the insurer is external and pays from its own wallet, so our side only opens an incoming payment on custody
// for the indemnity (no grant) and later reads what it received.
export abstract class IndemnityInflow {
  /** The incoming payment URL the insurer pays into; null in simulated mode (nothing to pay into). */
  abstract request(order: IndemnityOrder): Promise<string | null>;
  /** What that incoming payment received so far, in minor units. */
  abstract received(incomingPaymentUrl: string): Promise<number>;
}
