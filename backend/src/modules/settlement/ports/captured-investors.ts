import type { InvestorPosition } from "../application/settlement";

// Abstract class (not interface) so it doubles as the Nest DI token. The investments module provides it (block 4, RF-10).
export abstract class CapturedInvestors {
  /** One position per captured investment of the project: COP capital as it reached custody, the wallet's currency and address. */
  abstract forProject(projectId: string): Promise<InvestorPosition[]>;
}
