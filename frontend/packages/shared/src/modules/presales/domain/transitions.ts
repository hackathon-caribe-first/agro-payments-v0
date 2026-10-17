// Allowed transitions as DATA (action -> next status). New statuses or actions are table-only changes.
// "UNKNOWN" statuses have no row, so nothing can transition out of them.

export type TransitionTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const REQUEST_TRANSITIONS: TransitionTable = {
  REQUESTED: { respond: "QUOTED", decline: "REJECTED", cancel: "CANCELLED", withdraw: "CANCELLED" },
  QUOTED: { counter: "NEGOTIATING", accept: "ACCEPTED", reject: "REJECTED", withdraw: "CANCELLED" },
  NEGOTIATING: { counter: "NEGOTIATING", accept: "ACCEPTED", reject: "REJECTED", withdraw: "CANCELLED" },
};

export const QUOTE_TRANSITIONS: TransitionTable = {
  SENT: { accept: "ACCEPTED", reject: "REJECTED", supersede: "SUPERSEDED", withdraw: "WITHDRAWN" },
};

export const LISTING_TRANSITIONS: TransitionTable = {
  OPEN: { close: "CLOSED" },
};

export const OPEN_REQUEST_TRANSITIONS: TransitionTable = {
  OPEN: { close: "CLOSED" },
};

// Who may perform an action: a fixed side, the side whose turn it is ("TURN"), or either side ("ANY").
export type ActionActor = "BUYER" | "PRODUCER" | "TURN" | "ANY";

export const ACTION_ACTOR: Readonly<Record<string, ActionActor>> = {
  respond: "PRODUCER",
  decline: "PRODUCER",
  cancel: "BUYER",
  counter: "TURN",
  accept: "TURN",
  reject: "TURN",
  withdraw: "ANY",
};

export const nextStatus = (table: TransitionTable, from: string, action: string): string | null =>
  table[from]?.[action] ?? null;
