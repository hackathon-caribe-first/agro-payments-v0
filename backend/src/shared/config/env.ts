import { existsSync } from "node:fs";

export type Env = {
  port: number;
  databaseUrl: string;
  betterAuthSecret: string;
  apiUrl: string;
  // Origins of the web clients allowed by CORS and trusted by Better Auth.
  webOrigins: string[];
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

// Reads .env once (if present) and validates the variables the app needs.
export function loadEnv(): Env {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const port = Number(process.env.PORT ?? 3000);
  return {
    port,
    databaseUrl: required("DATABASE_URL"),
    betterAuthSecret: required("BETTER_AUTH_SECRET"),
    apiUrl: process.env.API_URL ??`http://localhost:${port}`,
    webOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(",").map((origin) => origin.trim()),
  };
}
