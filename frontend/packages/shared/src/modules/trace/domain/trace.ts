// Trace view for support (RF-20): the Open Payments requests behind every grant, payment line and settlement line, rendered as
// curl commands. Tokens are trimmed by default (RNF-02). Everything here is DERIVED from receipts and events, so it is
// deterministic and carries no real secret: the "full" tokens are mock values computed from the ids.

export const TRACE_STEPS = ["GRANT_REQUEST", "GRANT_CONTINUE", "INCOMING_PAYMENT", "QUOTE", "OUTGOING_PAYMENT", "VERIFICATION", "ROTATE_TOKEN", "REVOKE"] as const;
export type TraceStep = (typeof TRACE_STEPS)[number];

export const STEP_LABEL: Record<TraceStep, string> = {
  GRANT_REQUEST: "Solicitud del grant",
  GRANT_CONTINUE: "Continuación del grant",
  INCOMING_PAYMENT: "Pago entrante (incoming payment)",
  QUOTE: "Cotización (quote)",
  OUTGOING_PAYMENT: "Pago saliente (outgoing payment)",
  VERIFICATION: "Verificación",
  ROTATE_TOKEN: "Rotación del token",
  REVOKE: "Revocación del grant",
};

export type HttpMethod = "GET" | "POST" | "DELETE";

export interface TraceHeader {
  name: string;
  value: string;
  // True when the value carries a token that must be trimmed unless the operator asks for the full one.
  secret: boolean;
}

export interface TraceEntry {
  id: string;
  step: TraceStep;
  projectId: string | null;
  projectTitle: string;
  milestoneId: string | null;
  milestoneTitle: string;
  // What the request is about: a payment line, a grant or a settlement line.
  subject: string;
  at: string;
  method: HttpMethod;
  url: string;
  headers: TraceHeader[];
  body: unknown | null;
  // Expected answer, shown next to the command for support.
  expect: string;
}

export interface TraceFilter {
  projectId?: string;
  milestoneId?: string;
  step?: TraceStep;
}

export interface TraceOption {
  id: string;
  label: string;
}

export interface TraceView {
  entries: TraceEntry[];
  projects: TraceOption[];
  milestones: Array<TraceOption & { projectId: string | null }>;
}

// ---- tokens (RNF-02) ----

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Deterministic 40-character mock token. It is never a real credential.
export function mockToken(seed: string): string {
  let out = "";
  for (let i = 0; out.length < 40; i++) out += fnv1a(`${seed}#${i}`).toString(16).padStart(8, "0");
  return out.slice(0, 40);
}

// `abcd…wxyz`: only the first and last four characters survive.
export function trimToken(token: string): string {
  return token.length <= 8 ? "…" : `${token.slice(0, 4)}…${token.slice(-4)}`;
}

const GNAP_PREFIX = "GNAP ";

export function displayHeaderValue(header: TraceHeader, revealTokens: boolean): string {
  if (!header.secret || revealTokens) return header.value;
  return header.value.startsWith(GNAP_PREFIX) ? `${GNAP_PREFIX}${trimToken(header.value.slice(GNAP_PREFIX.length))}` : trimToken(header.value);
}

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

// Multi-line curl command. With `revealTokens` false every secret header is trimmed.
export function toCurl(entry: Pick<TraceEntry, "method" | "url" | "headers" | "body">, revealTokens: boolean): string {
  const lines = [`curl -X ${entry.method} ${shellQuote(entry.url)}`];
  for (const h of entry.headers) lines.push(`  -H ${shellQuote(`${h.name}: ${displayHeaderValue(h, revealTokens)}`)}`);
  if (entry.body !== null && entry.body !== undefined) lines.push(`  -d ${shellQuote(JSON.stringify(entry.body, null, 2))}`);
  return lines.join(" \\\n");
}

export function filterTrace(entries: readonly TraceEntry[], filter: TraceFilter): TraceEntry[] {
  return entries.filter(
    (e) =>
      (!filter.projectId || e.projectId === filter.projectId) &&
      (!filter.milestoneId || e.milestoneId === filter.milestoneId) &&
      (!filter.step || e.step === filter.step),
  );
}

// Groups in step order; inside a step, oldest request first (the order in which they happened).
export function groupByStep(entries: readonly TraceEntry[]): Array<{ step: TraceStep; entries: TraceEntry[] }> {
  return TRACE_STEPS.map((step) => ({
    step,
    entries: entries.filter((e) => e.step === step).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
  })).filter((g) => g.entries.length > 0);
}

export const parseStep = (raw: string | null): TraceStep | undefined => TRACE_STEPS.find((s) => s === raw);
