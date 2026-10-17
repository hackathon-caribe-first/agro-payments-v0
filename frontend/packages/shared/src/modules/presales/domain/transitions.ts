// Allowed transitions as DATA (action -> next status). New statuses or actions are table-only changes.
// "UNKNOWN" statuses have no row, so nothing can transition out of them.

export type TransitionTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const REQUEST_TRANSITIONS: TransitionTable = {
  REQUESTED: { respond: "QUOTED", decline: "REJECTED", cancel: "CANCELLED", withdraw: "CANCELLED", auto_close: "CANCELLED" },
  QUOTED: { counter: "NEGOTIATING", accept: "ACCEPTED", reject: "REJECTED", withdraw: "CANCELLED", auto_close: "CANCELLED" },
  NEGOTIATING: { counter: "NEGOTIATING", accept: "ACCEPTED", reject: "REJECTED", withdraw: "CANCELLED", auto_close: "CANCELLED" },
};

export const QUOTE_TRANSITIONS: TransitionTable = {
  SENT: { accept: "ACCEPTED", reject: "REJECTED", supersede: "SUPERSEDED", withdraw: "WITHDRAWN", auto_close: "WITHDRAWN" },
};

// A project agreement is PENDING its deposit until the buyer executes it.
export const DEPOSIT_TRANSITIONS: TransitionTable = {
  PENDING: { deposit: "DEPOSITED" },
};

export const OPEN_REQUEST_TRANSITIONS: TransitionTable = {
  OPEN: { close: "CLOSED" },
};

// Who may perform an action: a fixed side, the side whose turn it is ("TURN"), or either side ("ANY").
export type ActionActor = "BUYER" | "PRODUCER" | "TURN" | "ANY" | "SYSTEM";

export const ACTION_ACTOR: Readonly<Record<string, ActionActor>> = {
  respond: "PRODUCER",
  decline: "PRODUCER",
  cancel: "BUYER",
  counter: "TURN",
  accept: "TURN",
  reject: "TURN",
  withdraw: "ANY",
  // Only the system closes rivals when an agreement is reached.
  auto_close: "SYSTEM",
  deposit: "BUYER",
};

export const nextStatus = (table: TransitionTable, from: string, action: string): string | null =>
  table[from]?.[action] ?? null;
