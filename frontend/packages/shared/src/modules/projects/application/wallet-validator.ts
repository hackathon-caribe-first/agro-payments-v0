// Port: checks a producer wallet address (RF-01) before the project is saved. Implemented in the composition root over
// `GET <wallet address>` (the existing wallet validation of the payment lines module). Implementations throw NetworkError or BoundaryError.
export type WalletCheck =
  | { valid: true; url: string; assetCode: string; assetScale: number; publicName: string }
  // `message` is user-facing es-CO copy: invalid URL, unknown provider, wallet not found or another currency.
  | { valid: false; message: string };

export interface WalletValidator {
  check(walletAddress: string): Promise<WalletCheck>;
}
