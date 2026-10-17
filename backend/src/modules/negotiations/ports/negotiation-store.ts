import type { Project } from "../../projects/application/project";
import type { LedgerEntryDto, OpenRequestDto, QuoteRequestDto } from "../domain/wire";

// Records keep the web app's wire shape, but buyer_id / producer_id hold Better Auth user ids: the /api mappers swap in the
// public ids (see PublicIds). Amounts are whole pesos like the wire, except the project's own minor-unit balances.
export type NegotiationRecord = QuoteRequestDto;
export type OpenRequestRecord = Omit<OpenRequestDto, "awarded_quantity">;
export type LedgerRecord = LedgerEntryDto & { payment_reference: string | null };

export type NegotiationFilter = { projectId?: string; buyerId?: string; producerId?: string; openRequestId?: string };
export type OpenRequestFilter = { status?: string; buyerId?: string };

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class NegotiationStore {
  abstract findNegotiation(id: string): Promise<NegotiationRecord | null>;
  /** Oldest first. */
  abstract listNegotiations(filter: NegotiationFilter): Promise<NegotiationRecord[]>;
  /** Upserts the negotiation and its quotes; history is append-only (existing entries are never rewritten). */
  abstract saveNegotiation(negotiation: NegotiationRecord): Promise<void>;

  abstract findOpenRequest(id: string): Promise<OpenRequestRecord | null>;
  abstract listOpenRequests(filter: OpenRequestFilter): Promise<OpenRequestRecord[]>;
  abstract saveOpenRequest(openRequest: OpenRequestRecord): Promise<void>;

  abstract findProject(id: string): Promise<Project | null>;
  /** Every project, oldest first. */
  abstract listProjects(): Promise<Project[]>;
  abstract listLedger(projectId: string): Promise<LedgerRecord[]>;
  abstract addLedgerEntry(entry: LedgerRecord): Promise<void>;
  /** Adds to the project's custody balance (minor units) and marks it FUNDED_IN_CUSTODY. */
  abstract creditCustody(projectId: string, amountMinor: number): Promise<void>;

  /** Runs `work` in one transaction serialized on the project row; the store it receives is bound to that transaction. */
  abstract transaction<T>(projectId: string, work: (store: NegotiationStore) => Promise<T>): Promise<T>;
}
