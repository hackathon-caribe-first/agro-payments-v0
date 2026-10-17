// Conversational assistant (PRD v3 RF-33..RF-41). Pure types and rules: no Nest, no I/O.
// The assistant never moves money: it records intents that the producer confirms ("sí", plus the PIN for order lines)
// and that then go through the same use cases as the app.

export const INTENT_TYPE = {
  DRAFT_PROJECT: "DRAFT_PROJECT",
  MILESTONE_EVIDENCE: "MILESTONE_EVIDENCE",
  ORDER_LINE: "ORDER_LINE",
} as const;
export type IntentType = (typeof INTENT_TYPE)[keyof typeof INTENT_TYPE];

export const INTENT_STATUS = { PENDING: "pending", CONFIRMED: "confirmed", REJECTED: "rejected", EXPIRED: "expired" } as const;
export type IntentStatus = (typeof INTENT_STATUS)[keyof typeof INTENT_STATUS];

/** D-14: the PIN is required only for intents that create a payment line. */
export const requiresPin = (type: IntentType) => type === INTENT_TYPE.ORDER_LINE;

/** A pending intent left unanswered this long can no longer be confirmed. */
export const INTENT_TTL_MS = 30 * 60 * 1000;
export const isExpired = (intent: Pick<Intent, "createdAt">, now: Date) => now.getTime() - intent.createdAt.getTime() > INTENT_TTL_MS;

export type DraftProjectPayload = {
  title: string;
  description: string;
  productionType: string;
  startDate: string;
  estimatedEndDate: string;
  milestones: { title: string; description: string; estimatedCompletionDate: string; suppliesBudget: number; laborBudget: number }[];
};

export type EvidencePayloadIntent = {
  milestoneId: string;
  milestoneTitle: string;
  logType: string;
  notes: string;
  evidencePayload: Record<string, number | boolean | string[]>;
  photoCount: number;
  location: { latitude: number; longitude: number } | null;
  /** RF-35: sha256 (hex) of each photo, as the channel computed it; absent on intents from before it existed. */
  photoHashes?: { url: string; sha256: string }[];
};

/** Pesos are whole COP, like the /api project budgets. */
export type OrderLinePayload = {
  milestoneId: string;
  milestoneTitle: string;
  supplier: string;
  product: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

export type IntentPayload =
  | { type: typeof INTENT_TYPE.DRAFT_PROJECT; data: DraftProjectPayload }
  | { type: typeof INTENT_TYPE.MILESTONE_EVIDENCE; data: EvidencePayloadIntent }
  | { type: typeof INTENT_TYPE.ORDER_LINE; data: OrderLinePayload };

export type Intent = IntentPayload & {
  id: string;
  conversationId: string;
  userId: string;
  /** Rendered by code from the payload (templates.ts), never by the model. */
  summary: string;
  requiresPin: boolean;
  status: IntentStatus;
  createdAt: Date;
  /** When the producer answered (confirmed or rejected) and who did. */
  decidedAt: Date | null;
  decidedBy: string | null;
  /** What confirming produced, e.g. the created project's id and code. */
  result: Record<string, unknown> | null;
};

export type Conversation = { id: string; userId: string; needsTechnician: boolean; createdAt: Date };

export const MESSAGE_ROLE = { USER: "user", ASSISTANT: "assistant", TOOL: "tool" } as const;
export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];
/** RF-41 audit trail. Tool messages are one-line summaries; the PIN never appears in any message. */
export type Message = { id: string; conversationId: string; role: MessageRole; text: string; createdAt: Date };
