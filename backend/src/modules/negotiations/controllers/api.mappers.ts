// Records → /api wire shapes: the only place user ids become the public ids the web app knows (PublicIds) and internal fields drop.
import type { IdAliases } from "../../auth/application/demo-parties";
import { toProjectResponse } from "../../projects/controllers/api.mappers";
import type { CatalogEntry, DepositOutcome } from "../application/negotiations.service";
import type { LedgerEntryDto, OpenRequestDto } from "../domain/wire";
import type { LedgerRecord } from "../ports/negotiation-store";

export const toNegotiationResponse = (n: DepositOutcome, ids: IdAliases): DepositOutcome => ({
  ...n,
  buyer_id: ids.toPublic(n.buyer_id),
  ...(n.producer_id ? { producer_id: ids.toPublic(n.producer_id) } : {}),
});

export const toOpenRequestResponse = (o: OpenRequestDto, ids: IdAliases): OpenRequestDto => ({ ...o, buyer_id: ids.toPublic(o.buyer_id) });

export const toLedgerResponse = ({ payment_reference: _, ...e }: LedgerRecord, ids: IdAliases): LedgerEntryDto => ({ ...e, buyer_id: ids.toPublic(e.buyer_id) });

export const toCatalogResponse = (e: CatalogEntry, ids: IdAliases) => ({
  ...toProjectResponse(e.project),
  producer_id: ids.toPublic(e.project.ownerUserId),
  producer_name: e.producerName,
  negotiation_locked: e.negotiationLocked,
  agreed_milestone_ids: e.agreedMilestoneIds,
});
