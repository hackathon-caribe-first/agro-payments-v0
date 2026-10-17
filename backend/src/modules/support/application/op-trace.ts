// RF-28: the support trace of every Open Payments request the backend makes, rendered as a curl command.
// Pure functions plus the correlation context: no Nest, no I/O. Secrets never leave this file whole (trimSecret).
import { AsyncLocalStorage } from "node:async_hooks";

/** Which business object a request belongs to, when the caller knows it. */
export type OpTraceCorrelation = {
  projectId?: string;
  milestoneId?: string;
  negotiationId?: string;
  investmentId?: string;
  settlementId?: string;
};

export type OpTrace = {
  id: string;
  method: string;
  url: string;
  /** HTTP status: the error's when the SDK reports one, else inferred from the method on success; null when unknown. */
  status: number | null;
  durationMs: number;
  /** Redacted request body. */
  requestBody: unknown;
  /** Redacted, truncated response (or null on error). */
  responseSummary: string | null;
  error: string | null;
  curl: string;
  projectId: string | null;
  milestoneId: string | null;
  negotiationId: string | null;
  investmentId: string | null;
  settlementId: string | null;
  createdAt: Date;
};

const SHOWN = 6;
/** First 6 characters and an ellipsis; a secret that short shows nothing. */
export const trimSecret = (secret: string) => (secret.length <= SHOWN ? "…" : `${secret.slice(0, SHOWN)}…`);

// Leaves: trimmed when they are strings. Branches: every string below them is trimmed, except the grant's `access` list.
const SECRET_LEAVES = new Set(
  ["nonce", "interact_ref", "interactRef", "hash", "finish", "continueToken", "clientNonce", "finishNonce", "accessToken", "privateKey", "signature", "authorization"].map(
    (k) => k.toLowerCase(),
  ),
);
const SECRET_BRANCHES = new Set(["access_token", "token"]);
const PUBLIC_UNDER_SECRET = "access";

function redactValue(value: unknown, secret: boolean): unknown {
  if (typeof value === "string") return secret ? trimSecret(value) : value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, secret));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      const lower = key.toLowerCase();
      if (key === PUBLIC_UNDER_SECRET) return [key, redactValue(v, false)];
      if (SECRET_BRANCHES.has(lower)) return [key, redactValue(v, true)];
      if (SECRET_LEAVES.has(lower) && typeof v === "string") return [key, trimSecret(v)];
      return [key, redactValue(v, secret)];
    }),
  );
}

/** A deep copy with every token, nonce, interact ref, hash and key trimmed. */
export const redact = (value: unknown): unknown => redactValue(value, false);

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export type OpCall = { method: string; url: string; accessToken: string | null; body: unknown };

/** The request as a copy-pasteable curl; the GNAP token and body secrets are trimmed (not runnable as is, on purpose). */
export function renderCurl({ method, url, accessToken, body }: OpCall): string {
  const parts = [`curl -X ${method}`, quote(url)];
  if (accessToken) parts.push(`-H ${quote(`Authorization: GNAP ${trimSecret(accessToken)}`)}`);
  if (body !== null && body !== undefined) parts.push(`-H ${quote("Content-Type: application/json")}`, `-d ${quote(JSON.stringify(redact(body)))}`);
  return parts.join(" ");
}

const SUMMARY_MAX = 1000;
const summarize = (response: unknown) => {
  if (response === undefined || response === null) return null;
  const text = JSON.stringify(redact(response)) ?? null;
  return text && text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
};

// Project milestones are `${projectId}-ms-${n}` (projects/application/project.ts buildProject).
export const projectOfMilestone = (milestoneId: string | undefined) => milestoneId?.match(/^(.+)-ms-\d+$/)?.[1] ?? null;

export type TraceInput = {
  call: OpCall;
  status: number | null;
  durationMs: number;
  response: unknown;
  error: string | null;
  correlation: OpTraceCorrelation;
  now: Date;
  id: string;
};

export function buildTrace({ call, status, durationMs, response, error, correlation, now, id }: TraceInput): OpTrace {
  return {
    id,
    method: call.method,
    url: call.url,
    status,
    durationMs,
    requestBody: call.body === undefined ? null : redact(call.body),
    responseSummary: summarize(response),
    error,
    curl: renderCurl(call),
    projectId: correlation.projectId ?? projectOfMilestone(correlation.milestoneId),
    milestoneId: correlation.milestoneId ?? null,
    negotiationId: correlation.negotiationId ?? null,
    investmentId: correlation.investmentId ?? null,
    settlementId: correlation.settlementId ?? null,
    createdAt: now,
  };
}

const context = new AsyncLocalStorage<OpTraceCorrelation>();

/** Runs `fn` with this correlation (merged over any outer one) attached to every Open Payments request it makes. */
export const withOpTraceContext = <T>(correlation: OpTraceCorrelation, fn: () => Promise<T>): Promise<T> =>
  context.run({ ...context.getStore(), ...correlation }, fn);

export const currentCorrelation = (): OpTraceCorrelation => ({ ...context.getStore() });
