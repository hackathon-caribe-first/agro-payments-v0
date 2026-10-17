// Payment receipt view (RF-20): the raw Open Payments steps of one payment folded onto the canonical stages
// Cobro creado → Cotización → Pago enviado → Confirmado, plus "Autorización" (the interactive grant) for the kinds that ask for one.
// Pure: the receipt card and its stepper only render what this returns.
import { formatMoney, formatRate } from "../../milestones/milestone-state";
import type { PaymentTimeline, TimelineStep } from "./payment-steps";

export const STAGE_STATUS = {
  DONE: "done",
  CURRENT: "current",
  FAILED: "failed",
  // A later stage happened but this one was never recorded (e.g. the deposit only logs "completed" on the re-check).
  SKIPPED: "skipped",
  PENDING: "pending",
} as const;
export type StageStatus = (typeof STAGE_STATUS)[keyof typeof STAGE_STATUS];

export const STAGE_KEY = {
  AUTHORIZATION: "authorization",
  INCOMING: "incoming",
  QUOTE: "quote",
  OUTGOING: "outgoing",
  CONFIRMED: "confirmed",
} as const;
export type StageKey = (typeof STAGE_KEY)[keyof typeof STAGE_KEY];

export const STAGE_LABEL: Record<StageKey, string> = {
  authorization: "Autorización",
  incoming: "Cobro creado",
  quote: "Cotización",
  outgoing: "Pago enviado",
  confirmed: "Confirmado",
};

// The step that proves each stage. Authorization is proven by the approval; a bare request leaves it current.
const STAGE_STEP: Record<StageKey, string> = {
  authorization: "grant_approved",
  incoming: "incoming_created",
  quote: "quote_created",
  outgoing: "outgoing_created",
  confirmed: "completed",
};

const CANONICAL: readonly StageKey[] = ["incoming", "quote", "outgoing", "confirmed"];

// Where each kind asks for the interactive grant (backend adapters): deposit and harvest before paying into custody,
// the investment capture after the quote (the grant limit is the quoted debit). Gateway kinds have no grant step.
const GRANT_KIND_ORDER: Record<string, readonly StageKey[]> = {
  buyer_deposit: ["authorization", ...CANONICAL],
  harvest_payment: ["authorization", ...CANONICAL],
  investment_capture: ["incoming", "quote", "authorization", "outgoing", "confirmed"],
};

export interface PaymentStage {
  key: StageKey;
  label: string;
  status: StageStatus;
  // When the stage happened (or failed); null while pending or never recorded.
  at: string | null;
  // Seconds since the previous stage that has a time; null for the first one.
  elapsedSeconds: number | null;
  opUrl: string | null;
  // Short qualifier shown next to the label, e.g. "falta confirmarlo".
  note: string | null;
}

export const PAYMENT_STATE = {
  CONFIRMED: "confirmed",
  FAILED: "failed",
  // The outgoing payment exists but its arrival could not be confirmed: money may have moved, nothing retries on its own.
  UNCONFIRMED: "unconfirmed",
  // Sent, the backend recorded no confirmation step (yet).
  SENT: "sent",
  IN_PROGRESS: "in_progress",
} as const;
export type PaymentState = (typeof PAYMENT_STATE)[keyof typeof PAYMENT_STATE];

export interface Money {
  value: string;
  assetCode: string;
  assetScale: number;
}

export interface PaymentAmounts {
  debit: Money | null;
  receive: Money | null;
  // Raw "numerator/denominator" or decimal string as the backend sent it.
  rate: string | null;
}

export interface PaymentReceiptView {
  stages: PaymentStage[];
  state: PaymentState;
  // The failure reason the backend recorded, if any.
  error: string | null;
  // The outgoing payment URL: the proof the payer can look up in their wallet.
  proofUrl: string | null;
  amounts: PaymentAmounts;
  // Newest step time, to show when the payment last moved.
  updatedAt: string;
}

// Tenths of a second: the Open Payments calls of one payment are often a second or two apart.
const seconds = (from: string, to: string): number | null => {
  const ms = Date.parse(to) - Date.parse(from);
  return Number.isNaN(ms) ? null : Math.max(0, Math.round(ms / 100) / 10);
};

const tenths = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// "3,3 s", "2 min 5 s": how long the stage took after the previous one.
export const formatElapsed = (value: number | null): string | null => {
  if (value === null) return null;
  if (value < 60) return `${tenths.format(value)} s`;
  const whole = Math.round(value);
  return `${Math.floor(whole / 60)} min ${whole % 60} s`;
};

// Who the money leaves from, per kind (backend adapters). Unknown kinds show no payer rather than a guess.
export const PAYMENT_PAYER: Record<string, string> = {
  buyer_deposit: "Comprador",
  harvest_payment: "Comprador",
  investment_capture: "Inversionista",
  milestone_line: "Custodia",
  settlement_payout: "Custodia",
  insurance_premium: "Custodia",
};
export const paymentPayer = (kind: string): string | null => PAYMENT_PAYER[kind] ?? null;

const lastOf = (steps: readonly TimelineStep[], name: string): TimelineStep | undefined => [...steps].reverse().find((s) => s.step === name);

export function stageOrder(timeline: Pick<PaymentTimeline, "kind" | "steps">): readonly StageKey[] {
  const known = GRANT_KIND_ORDER[timeline.kind];
  if (known) return known;
  // Unknown kind that still logged a grant: show it first rather than drop it.
  return timeline.steps.some((s) => s.step.startsWith("grant_")) ? ["authorization", ...CANONICAL] : CANONICAL;
}

export function toPaymentStages(timeline: Pick<PaymentTimeline, "kind" | "steps" | "outcome">): PaymentStage[] {
  const { steps } = timeline;
  const failed = timeline.outcome === "failed" ? lastOf(steps, "failed") : undefined;
  const unconfirmed = lastOf(steps, "sent_unconfirmed");

  const proof = (key: StageKey): TimelineStep | undefined =>
    lastOf(steps, STAGE_STEP[key]) ?? (key === "outgoing" && unconfirmed ? unconfirmed : undefined);

  const order = stageOrder(timeline);
  const proven = order.map((key) => proof(key));
  const lastDone = proven.reduce((last, step, i) => (step ? i : last), -1);
  // The stage in play: right after the last proven one. -1 once everything is proven.
  const currentIndex = lastDone + 1 < order.length ? lastDone + 1 : -1;

  let previousAt: string | null = null;
  return order.map((key, i): PaymentStage => {
    const step = proven[i];
    const base = { key, label: STAGE_LABEL[key], opUrl: step?.opUrl ?? null, note: null as string | null };
    if (step) {
      const elapsedSeconds = previousAt ? seconds(previousAt, step.at) : null;
      previousAt = step.at;
      const note = key === "outgoing" && unconfirmed && !lastOf(steps, "completed") ? "falta confirmarlo" : null;
      return { ...base, status: STAGE_STATUS.DONE, at: step.at, elapsedSeconds, note };
    }
    if (i < lastDone) return { ...base, status: STAGE_STATUS.SKIPPED, at: null, elapsedSeconds: null, note: "sin registro" };
    if (i === currentIndex && failed) {
      const elapsedSeconds = previousAt ? seconds(previousAt, failed.at) : null;
      return { ...base, status: STAGE_STATUS.FAILED, at: failed.at, elapsedSeconds, opUrl: failed.opUrl };
    }
    if (i === currentIndex) {
      const requested = key === "authorization" ? lastOf(steps, "grant_requested") : undefined;
      return { ...base, status: STAGE_STATUS.CURRENT, at: null, elapsedSeconds: null, opUrl: requested?.opUrl ?? null, note: requested ? "esperando aprobación" : null };
    }
    return { ...base, status: STAGE_STATUS.PENDING, at: null, elapsedSeconds: null };
  });
}

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

const toMoney = (value: unknown): Money | null => {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const amount = typeof raw.value === "number" ? String(raw.value) : str(raw.value);
  const assetCode = str(raw.assetCode);
  const assetScale = typeof raw.assetScale === "number" ? raw.assetScale : 0;
  return amount && /^-?\d+$/.test(amount) && assetCode ? { value: amount, assetCode, assetScale } : null;
};

// ponytail: today the backend records no amounts in `detail`; these keys follow the Open Payments quote shape so they light up
// the day a step carries them, and the receipt simply omits amount and rate until then.
export function paymentAmounts(steps: readonly TimelineStep[]): PaymentAmounts {
  const pick = <T>(read: (detail: Record<string, unknown>) => T | null): T | null => {
    for (const s of [...steps].reverse()) {
      const found = s.detail ? read(s.detail) : null;
      if (found !== null) return found;
    }
    return null;
  };
  return {
    debit: pick((d) => toMoney(d.debitAmount) ?? toMoney(d.debit)),
    receive: pick((d) => toMoney(d.receiveAmount) ?? toMoney(d.receive) ?? toMoney(d.amount)),
    rate: pick((d) => str(d.rate) ?? (typeof d.rate === "number" ? String(d.rate) : null)),
  };
}

export const formatPaymentMoney = (money: Money): string => formatMoney(Number(money.value), money.assetCode, money.assetScale);

// "1 USD = 4.100 COP" when the wallet converted between assets, else the raw rate the step carried; null when there is nothing to show.
export function fxRateText({ debit, receive, rate }: PaymentAmounts): string | null {
  if (debit && receive && debit.assetCode !== receive.assetCode) {
    const out = Number(debit.value) / 10 ** debit.assetScale;
    const inn = Number(receive.value) / 10 ** receive.assetScale;
    if (!inn) return null;
    return `1 ${receive.assetCode} = ${(out / inn).toLocaleString("es-CO", { maximumFractionDigits: 4 })} ${debit.assetCode}`;
  }
  if (!rate) return null;
  const text = formatRate(rate) ?? (Number.isFinite(Number(rate)) ? Number(rate).toLocaleString("es-CO", { maximumFractionDigits: 4 }) : null);
  return text;
}

// The id is the last path segment of the Open Payments URL; its first 8 characters are enough to find it in the wallet.
export function shortResourceId(url: string): string {
  const id = url.split(/[/?#]/).filter(Boolean).at(-1) ?? url;
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

const reasonOf = (step: TimelineStep | undefined): string | null => str(step?.detail?.reason) ?? str(step?.detail?.error);

export function toPaymentReceipt(timeline: PaymentTimeline): PaymentReceiptView {
  const { steps } = timeline;
  const stages = toPaymentStages(timeline);
  const outgoing = stages.find((s) => s.key === "outgoing");
  const state: PaymentState =
    timeline.outcome === "completed"
      ? PAYMENT_STATE.CONFIRMED
      : timeline.outcome === "failed"
        ? PAYMENT_STATE.FAILED
        : lastOf(steps, "sent_unconfirmed")
          ? PAYMENT_STATE.UNCONFIRMED
          : outgoing?.status === STAGE_STATUS.DONE
            ? PAYMENT_STATE.SENT
            : PAYMENT_STATE.IN_PROGRESS;
  return {
    stages,
    state,
    error: timeline.outcome === "failed" ? reasonOf(lastOf(steps, "failed")) : null,
    proofUrl: lastOf(steps, "outgoing_created")?.opUrl ?? lastOf(steps, "sent_unconfirmed")?.opUrl ?? lastOf(steps, "completed")?.opUrl ?? null,
    amounts: paymentAmounts(steps),
    updatedAt: steps.at(-1)?.at ?? "",
  };
}
