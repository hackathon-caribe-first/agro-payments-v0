// Abstract class (not interface) so it doubles as the Nest DI token. ContractsModule provides it; the simulation publish gate
// (RF-07) reads it: RF-04 «contrato de compra antes de publicar».
export abstract class PurchaseContracts {
  abstract exists(projectId: string): Promise<boolean>;
}
