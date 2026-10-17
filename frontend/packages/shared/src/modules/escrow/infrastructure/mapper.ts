import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import { LEDGER_CATEGORIES, LEDGER_TYPES, type LedgerEntry } from "../domain/ledger";
import { ledgerEntryDtoSchema, type LedgerEntryDto } from "./dto";

// Unknown values degrade to UNKNOWN instead of failing the whole response.
function toKnown<K extends string>(raw: string, known: readonly K[]): K | "UNKNOWN" {
  return (known as readonly string[]).includes(raw) ? (raw as K) : "UNKNOWN";
}

const fromDto = (dto: LedgerEntryDto): LedgerEntry => ({
  id: dto.id,
  projectId: dto.project_id,
  type: toKnown(dto.type, LEDGER_TYPES),
  category: toKnown(dto.category, LEDGER_CATEGORIES),
  amount: dto.amount,
  currency: dto.currency,
  negotiationId: dto.negotiation_id,
  buyerId: dto.buyer_id,
  createdAt: dto.created_at,
});

export function toLedgerEntries(data: unknown): LedgerEntry[] {
  const result = z.array(ledgerEntryDtoSchema).safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ledger: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data.map(fromDto);
}
