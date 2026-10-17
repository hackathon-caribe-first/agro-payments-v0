import { existsSync } from "node:fs";

export const PAYMENT_GATEWAYS = { OPEN_PAYMENTS: "open-payments", SIMULATED: "simulated" } as const;
export type PaymentGatewayMode = (typeof PAYMENT_GATEWAYS)[keyof typeof PAYMENT_GATEWAYS];

// Interledger testnet credentials, only read when PAYMENT_GATEWAY=open-payments.
export type OpenPaymentsEnv = {
  /** Wallet that identifies this platform as the GNAP client (its key is registered there). */
  clientWalletAddress: string;
  keyId: string;
  privateKeyPath: string;
  /** v3 payer: the custody wallet debited by every milestone grant. */
  custodyWalletAddress: string;
  /** Wallet every seeded line pays to. */
  receiverWalletAddress: string;
  /** Block 3 payer of buyer custody deposits (OP_BUYER_WALLET_ADDRESS). Null when unset: startup still works and only a deposit refuses. */
  buyerWalletAddress: string | null;
  assetCode: string;
  assetScale: number;
  /** Base64 AES-256 key (32 bytes) that encrypts grant tokens at rest. */
  grantEncryptionKey: string;
};

export type Env = {
  port: number;
  databaseUrl: string;
  betterAuthSecret: string;
  apiUrl: string;
  // Origins of the web clients allowed by CORS and trusted by Better Auth.
  webOrigins: string[];
  paymentGateway: PaymentGatewayMode;
  /** Set only when paymentGateway is open-payments. */
  openPayments: OpenPaymentsEnv | null;
  /** Demo only: /api routes act as the seeded demo producer when there is no session (see ResolveApiUserUseCase). */
  demoIdentity: boolean;
  /** Optional: without it the assistant chat answers 503 and everything else works. */
  anthropicApiKey: string | null;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function paymentGateway(): PaymentGatewayMode {
  const value = process.env.PAYMENT_GATEWAY ?? PAYMENT_GATEWAYS.SIMULATED;
  const modes: string[] = Object.values(PAYMENT_GATEWAYS);
  if (!modes.includes(value)) throw new Error(`PAYMENT_GATEWAY must be one of ${modes.join(", ")}`);
  return value as PaymentGatewayMode;
}

function openPaymentsEnv(): OpenPaymentsEnv {
  const assetScale = Number(required("OP_ASSET_SCALE"));
  if (!Number.isInteger(assetScale) || assetScale < 0) throw new Error("OP_ASSET_SCALE must be a non-negative integer");
  return {
    clientWalletAddress: required("OP_CLIENT_WALLET_ADDRESS"),
    keyId: required("OP_KEY_ID"),
    privateKeyPath: required("OP_PRIVATE_KEY_PATH"),
    // ponytail: one custody wallet per deployment; per-project custody wallets when projects exist.
    // Falls back to the pre-v3 investor wallet so existing .env files keep working.
    custodyWalletAddress: process.env.OP_CUSTODY_WALLET_ADDRESS || required("OP_INVESTOR_WALLET_ADDRESS"),
    receiverWalletAddress: required("OP_RECEIVER_WALLET_ADDRESS"),
    // ponytail: not required() so a running deployment without it keeps booting; set it to enable buyer deposits in open-payments mode.
    buyerWalletAddress: process.env.OP_BUYER_WALLET_ADDRESS || null,
    assetCode: required("OP_ASSET_CODE"),
    assetScale,
    grantEncryptionKey: required("GRANT_ENCRYPTION_KEY"),
  };
}

export function parseDemoIdentity(value: string | undefined): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("DEMO_IDENTITY must be true or false");
}

// Reads .env once (if present) and validates the variables the app needs.
export function loadEnv(): Env {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const port = Number(process.env.PORT ?? 3000);
  const gateway = paymentGateway();
  return {
    port,
    databaseUrl: required("DATABASE_URL"),
    betterAuthSecret: required("BETTER_AUTH_SECRET"),
    apiUrl: process.env.API_URL ??`http://localhost:${port}`,
    webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(",").map((origin) => origin.trim()),
    paymentGateway: gateway,
    openPayments: gateway === PAYMENT_GATEWAYS.OPEN_PAYMENTS ? openPaymentsEnv() : null,
    demoIdentity: parseDemoIdentity(process.env.DEMO_IDENTITY),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  };
}
