import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import { OpenPaymentsClientError } from "@interledger/open-payments";
import type { OpenPaymentsClient } from "../../milestones/infrastructure/adapters/open-payments.client";
import { buildTrace, currentCorrelation, type OpCall } from "../application/op-trace";
import type { OpTraceRepository } from "../ports/op-trace.repository";

// RF-28 without touching the SDK's signing: @interledger/open-payments 7.4.0 only offers `authenticatedRequestInterceptor`
// as a *replacement* for its own HTTP-signature interceptor (mutually exclusive with privateKey/keyId), so the client's
// methods are wrapped instead. Each SDK method maps to the HTTP request it makes (Open Payments API paths).
type Route = { method: string; url: (base: string, args: Record<string, unknown>) => string; created?: boolean };
const at: Route["url"] = (base) => base;
const collection = (path: string): Route["url"] => (base, args) =>
  `${base.replace(/\/$/, "")}/${path}${typeof args.walletAddress === "string" ? `?wallet-address=${encodeURIComponent(args.walletAddress)}` : ""}`;

const ROUTES: Record<string, Record<string, Route>> = {
  walletAddress: { get: { method: "GET", url: at }, getKeys: { method: "GET", url: (b) => `${b}/jwks.json` }, getDIDDocument: { method: "GET", url: (b) => `${b}/did.json` } },
  grant: { request: { method: "POST", url: at }, continue: { method: "POST", url: at }, cancel: { method: "DELETE", url: at } },
  incomingPayment: {
    create: { method: "POST", url: collection("incoming-payments"), created: true },
    get: { method: "GET", url: at },
    getPublic: { method: "GET", url: at },
    list: { method: "GET", url: collection("incoming-payments") },
    complete: { method: "POST", url: (b) => `${b}/complete` },
  },
  quote: { create: { method: "POST", url: collection("quotes"), created: true }, get: { method: "GET", url: at } },
  outgoingPayment: {
    create: { method: "POST", url: collection("outgoing-payments"), created: true },
    get: { method: "GET", url: at },
    list: { method: "GET", url: collection("outgoing-payments") },
    getGrantSpentAmounts: { method: "GET", url: (b) => `${b.replace(/\/$/, "")}/outgoing-payment-grant` },
  },
  token: { rotate: { method: "POST", url: at }, revoke: { method: "DELETE", url: at } },
};

const logger = new Logger("OpTrace");
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** The same client, recording every request in `traces` after it answers. Recording is async and never fails the call. */
export function traceOpenPaymentsClient(client: OpenPaymentsClient, traces: OpTraceRepository): OpenPaymentsClient {
  const wrapResource = (name: string, resource: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(resource).map(([method, fn]) => {
        const route = ROUTES[name]?.[method];
        if (typeof fn !== "function" || !route) return [method, fn];
        return [
          method,
          async (...args: unknown[]) => {
            const target = isRecord(args[0]) ? args[0] : {};
            const call: OpCall = {
              method: route.method,
              url: route.url(String(target.url ?? ""), target),
              accessToken: typeof target.accessToken === "string" ? target.accessToken : null,
              body: args[1] ?? null,
            };
            const correlation = currentCorrelation();
            const started = Date.now();
            const save = (status: number | null, response: unknown, error: string | null) => {
              const trace = buildTrace({ call, status, durationMs: Date.now() - started, response, error, correlation, now: new Date(), id: randomUUID() });
              // Off the hot path: the payment never waits for nor fails on the trace.
              void traces.record(trace).catch((e: unknown) => logger.warn(`Trace of ${call.method} ${call.url} not stored: ${e instanceof Error ? e.message : String(e)}`));
            };
            try {
              const response = await (fn as (...a: unknown[]) => Promise<unknown>).apply(resource, args);
              save(route.method === "DELETE" ? 204 : route.created ? 201 : 200, response, null);
              return response;
            } catch (error) {
              const status = error instanceof OpenPaymentsClientError ? (error.status ?? null) : null;
              const detail = error instanceof OpenPaymentsClientError && error.description ? `: ${error.description}` : "";
              save(status, null, `${error instanceof Error ? error.message : String(error)}${detail}`);
              throw error;
            }
          },
        ];
      }),
    );

  return Object.fromEntries(
    Object.entries(client).map(([name, resource]) => [name, isRecord(resource) ? wrapResource(name, resource) : resource]),
  ) as unknown as OpenPaymentsClient;
}
