// Abstract class (not interface) so it doubles as the Nest DI token. ContractsModule provides it; the simulation publish gate
// (RF-07) reads it: RF-04 «contrato de compra antes de publicar».
export abstract class PurchaseContracts {
  abstract exists(projectId: string): Promise<boolean>;
  /** The buyer wallet agreed in the contract, or null when there is no contract. Not abstract so existing fakes keep compiling. */
  async buyerWalletAddress(_projectId: string): Promise<string | null> {
    return null;
  }
}
