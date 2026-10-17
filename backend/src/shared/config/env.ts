import { existsSync } from "node:fs";

export const PAYMENT_GATEWAYS = { OPEN_PAYMENTS: "open-payments", SIMULATED: "simulated" } as const;
export type PaymentGatewayMode = (typeof PAYMENT_GATEWAYS)[keyof typeof PAYMENT_GATEWAYS];

// Interledger testnet credentials, only read when PAYMENT_GATEWAY=open-payments.
export type OpenPaymentsEnv = {
  /** Wallet that identifies this platform as the GNAP client (its key is registered there). */
  clientWalletAddress: string;
  keyId: string;
  privateKeyPath: string;
  /** Wallet debited by the funding grant. */
  investorWalletAddress: string;
  /** Wallet every seeded line pays to. */
  receiverWalletAddress: string;
  assetCode: string;
  assetScale: number;
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
    investorWalletAddress: required("OP_INVESTOR_WALLET_ADDRESS"),
    receiverWalletAddress: required("OP_RECEIVER_WALLET_ADDRESS"),
    assetCode: required("OP_ASSET_CODE"),
    assetScale,
  };
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
  };
}
