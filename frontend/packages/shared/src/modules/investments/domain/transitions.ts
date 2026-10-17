// Allowed transitions as DATA (action -> next status). New statuses or actions are table-only changes.
// "UNKNOWN" statuses have no row, so nothing can transition out of them.

export type TransitionTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

// A proposal opens PROPOSED (the investor's offer) and becomes NEGOTIATING from the first counter-offer.
export const PROPOSAL_TRANSITIONS: TransitionTable = {
  PROPOSED: { counter: "NEGOTIATING", accept: "ACCEPTED", reject: "REJECTED", withdraw: "WITHDRAWN", auto_close: "WITHDRAWN" },
  NEGOTIATING: { counter: "NEGOTIATING", accept: "ACCEPTED", reject: "REJECTED", withdraw: "WITHDRAWN", auto_close: "WITHDRAWN" },
};

export const REVISION_TRANSITIONS: TransitionTable = {
  SENT: { accept: "ACCEPTED", reject: "REJECTED", supersede: "SUPERSEDED", withdraw: "WITHDRAWN", auto_close: "WITHDRAWN" },
};

// Who may perform an action: a fixed side, the side whose turn it is ("TURN"), or the system.
export type ActionActor = "INVESTOR" | "PRODUCER" | "TURN" | "SYSTEM";

export const ACTION_ACTOR: Readonly<Record<string, ActionActor>> = {
  counter: "TURN",
  accept: "TURN",
  reject: "TURN",
  // The investor can pull the proposal back at any time; the producer's equivalent is rejecting on their turn.
  withdraw: "INVESTOR",
  auto_close: "SYSTEM",
};

export const nextStatus = (table: TransitionTable, from: string, action: string): string | null => table[from]?.[action] ?? null;
