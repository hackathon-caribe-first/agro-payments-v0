// Payment-steps timeline (RF-20, real backend): every Open Payments step the backend recorded for one payment, grouped into
// one card per (payment kind, payment id). Unlike the derived curl trace, these rows are real and carry no token at all.
// Unknown kinds and steps are kept with their raw value: the backend may grow faster than this screen.

export const PAYMENT_KINDS = ["buyer_deposit", "milestone_line", "settlement_payout", "investment_capture", "harvest_payment", "insurance_premium"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  buyer_deposit: "Depósito del comprador",
  milestone_line: "Pago de línea de hito",
  settlement_payout: "Pago de liquidación",
  investment_capture: "Captura de inversión",
  harvest_payment: "Pago de cosecha",
  insurance_premium: "Prima del seguro",
};

export const PAYMENT_STEPS = ["grant_requested", "grant_approved", "incoming_created", "quote_created", "outgoing_created", "sent_unconfirmed", "completed", "failed"] as const;
export type PaymentStep = (typeof PAYMENT_STEPS)[number];

export const PAYMENT_STEP_LABEL: Record<PaymentStep, string> = {
  grant_requested: "Grant solicitado",
  grant_approved: "Grant aprobado",
  incoming_created: "Cobro creado",
  quote_created: "Cotización",
  outgoing_created: "Pago enviado",
  sent_unconfirmed: "Enviado, falta confirmar",
  completed: "Confirmado",
  failed: "Falló",
};

const isKnown = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

export const paymentKindLabel = (kind: string): string => (isKnown(PAYMENT_KINDS, kind) ? PAYMENT_KIND_LABEL[kind] : kind);
export const paymentStepLabel = (step: string): string => (isKnown(PAYMENT_STEPS, step) ? PAYMENT_STEP_LABEL[step] : step);

// One row of GET /support/payment-steps, already validated. `kind` and `step` stay plain strings so unknown values survive.
export interface PaymentStepRow {
  kind: string;
  paymentId: string;
  step: string;
  at: string;
  opUrl: string | null;
  detail: Record<string, unknown> | null;
  projectId: string | null;
}

export interface TimelineStep {
  step: string;
  at: string;
  // Seconds since the previous step of the same payment; null for the first one (or an unparsable date).
  elapsedSeconds: number | null;
  opUrl: string | null;
  detail: Record<string, unknown> | null;
}

export type PaymentOutcome = "completed" | "failed" | "in_progress";

export interface PaymentTimeline {
  kind: string;
  paymentId: string;
  projectId: string | null;
  // Oldest first, the order in which they happened.
  steps: TimelineStep[];
  outcome: PaymentOutcome;
}

export interface PaymentStepsFilter {
  projectId?: string;
  kind?: string;
}

// A project filter option: value = project id, label = its title (code or id when the title is missing).
export interface ProjectOption {
  id: string;
  label: string;
}

export interface PaymentStepsView {
  payments: PaymentTimeline[];
  // Before the filter, so the count reads "n de total".
  total: number;
  projects: ProjectOption[];
  // Project id → label, so each card shows the title instead of the raw id.
  projectLabels: Record<string, string>;
  kinds: string[];
}

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// Defensive mapper: a row without kind, payment id, step or date is dropped instead of breaking the whole screen.
export function toPaymentStepRows(raw: unknown): PaymentStepRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const row = record(item);
    const kind = str(row?.payment_kind);
    const paymentId = str(row?.payment_id);
    const step = str(row?.step);
    const at = str(row?.at);
    if (!row || !kind || !paymentId || !step || !at) return [];
    return [{ kind, paymentId, step, at, opUrl: str(row.op_url), detail: record(row.detail), projectId: str(row.project_id) }];
  });
}

// Defensive mapper of GET /projects: every project an operator can see. Items without an id are dropped.
export function toProjectOptions(raw: unknown): ProjectOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const project = record(item);
    const id = str(project?.id);
    if (!project || !id) return [];
    return [{ id, label: str(project.title) ?? str(project.project_code) ?? id }];
  });
}

const seconds = (from: string, to: string): number | null => {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isNaN(ms) ? null : Math.max(0, Math.round(ms / 1000));
};

const outcomeOf = (last: string | undefined): PaymentOutcome => (last === "completed" ? "completed" : last === "failed" ? "failed" : "in_progress");

// One timeline per (kind, payment id), steps oldest first; payments ordered by their latest step, most recent first.
export function groupPaymentSteps(rows: readonly PaymentStepRow[]): PaymentTimeline[] {
  const byPayment = new Map<string, PaymentStepRow[]>();
  for (const row of rows) {
    const key = `${row.kind}\u0000${row.paymentId}`;
    byPayment.set(key, [...(byPayment.get(key) ?? []), row]);
  }
  const timelines = [...byPayment.values()].map((group): PaymentTimeline => {
    // Stable sort: rows with the same instant keep the backend order.
    const sorted = [...group].sort((a, b) => a.at.localeCompare(b.at));
    const steps = sorted.map((row, i) => ({
      step: row.step,
      at: row.at,
      elapsedSeconds: i === 0 ? null : seconds(sorted[i - 1]!.at, row.at),
      opUrl: row.opUrl,
      detail: row.detail,
    }));
    const first = sorted[0]!;
    return {
      kind: first.kind,
      paymentId: first.paymentId,
      projectId: sorted.find((r) => r.projectId)?.projectId ?? null,
      steps,
      outcome: outcomeOf(steps.at(-1)?.step),
    };
  });
  return timelines.sort((a, b) => b.steps.at(-1)!.at.localeCompare(a.steps.at(-1)!.at));
}

// `projects` is the full project list (projects without payments included); null when it could not be read, and then the
// options fall back to the ids found in the rows. Ids in the rows but missing from the list are still offered, by id.
export function toPaymentStepsView(rows: readonly PaymentStepRow[], filter: PaymentStepsFilter, projects: readonly ProjectOption[] | null = null): PaymentStepsView {
  const all = groupPaymentSteps(rows);
  const unique = (values: Array<string | null>) => [...new Set(values.filter((v): v is string => v !== null))].sort();
  const known = projects ?? [];
  const listed = new Set(known.map((p) => p.id));
  const options = [...known, ...unique(all.map((p) => p.projectId)).flatMap((id) => (listed.has(id) ? [] : [{ id, label: id }]))];
  return {
    payments: all.filter((p) => (!filter.projectId || p.projectId === filter.projectId) && (!filter.kind || p.kind === filter.kind)),
    total: all.length,
    projects: options,
    projectLabels: Object.fromEntries(options.map((p) => [p.id, p.label])),
    kinds: unique(all.map((p) => p.kind)),
  };
}

// `https://wallet.example/very/long/path/abc123` → `wallet.example/…/abc123`: enough to recognize the resource.
export function shortenUrl(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    const last = pathname.split("/").filter(Boolean).at(-1);
    if (!last) return host;
    return pathname.split("/").filter(Boolean).length > 1 ? `${host}/…/${last}` : `${host}/${last}`;
  } catch {
    return url.length > 48 ? `${url.slice(0, 24)}…${url.slice(-20)}` : url;
  }
}
