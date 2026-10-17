import { BoundaryError } from "../../milestones/domain/errors";
import { ENTRY_SOURCES, RECONCILIATION_STATUSES, type EntrySource, type ReconciliationEntry, type ReconciliationStatus } from "../domain/reconciliation";
import { entriesDtoSchema, entryDtoSchema, type EntryDto } from "./dto";

const known = <K extends string>(raw: string, values: readonly K[]): K | "UNKNOWN" => ((values as readonly string[]).includes(raw) ? (raw as K) : "UNKNOWN");

export function fromEntryDto(dto: EntryDto): ReconciliationEntry {
  return {
    id: dto.id,
    status: known<Exclude<ReconciliationStatus, "UNKNOWN">>(dto.status, RECONCILIATION_STATUSES),
    source: known<Exclude<EntrySource, "UNKNOWN">>(dto.source, ENTRY_SOURCES),
    projectId: dto.project_id ?? null,
    projectTitle: dto.project_title,
    concept: dto.concept,
    beneficiaryName: dto.beneficiary_name,
    beneficiaryWallet: dto.beneficiary_wallet,
    currency: dto.currency,
    receiptId: dto.receipt_id,
    outgoingPaymentId: dto.outgoing_payment_id,
    receiptAmount: dto.receipt_amount,
    fee: dto.fee,
    sentAmount: dto.sent_amount,
    incomingPaymentId: dto.incoming_payment_id,
    incomingAmount: dto.incoming_amount,
    occurredAt: dto.occurred_at,
    reviews: dto.reviews.map((r) => ({ id: r.id, at: r.at, actor: r.actor, note: r.note })),
  };
}

export function toEntries(data: unknown): ReconciliationEntry[] {
  const parsed = entriesDtoSchema.safeParse(data);
  if (!parsed.success) throw new BoundaryError("Unexpected reconciliation payload");
  return parsed.data.map(fromEntryDto);
}

export function toEntry(data: unknown): ReconciliationEntry {
  const parsed = entryDtoSchema.safeParse(data);
  if (!parsed.success) throw new BoundaryError("Unexpected reconciliation entry payload");
  return fromEntryDto(parsed.data);
}
