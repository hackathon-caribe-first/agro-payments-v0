import type { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import {
  GRANT_ACTORS,
  GRANT_EVENT_TYPES,
  GRANT_STATUSES,
  HASH_STATES,
  REVOCATION_REASONS,
  type GrantDetail,
  type GrantEvent,
  type GrantMilestoneRef,
  type GrantProjectRef,
  type GrantView,
  type InvestorGrantsView,
  type MilestoneGrant,
  type ProjectGrantsView,
  type SpendResult,
  type GrantSpendEvent,
  type WalletConsent,
} from "../domain/grant";
import {
  consentDtoSchema,
  grantDetailDtoSchema,
  grantDtoSchema,
  investorGrantsDtoSchema,
  projectGrantsDtoSchema,
  spendResultDtoSchema,
  type GrantDto,
  type GrantEventDto,
  type GrantMilestoneDto,
  type GrantProjectDto,
  type SpendEventDto,
} from "./dto";

// Unknown values degrade to UNKNOWN instead of failing the whole response.
function toKnown<K extends string>(raw: string, known: readonly K[]): K | "UNKNOWN" {
  return (known as readonly string[]).includes(raw) ? (raw as K) : "UNKNOWN";
}

function parse<S extends z.ZodType>(schema: S, data: unknown, label: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${label}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

const fromGrantDto = (dto: GrantDto): MilestoneGrant => ({
  id: dto.id,
  projectId: dto.project_id,
  milestoneId: dto.milestone_id,
  investorId: dto.investor_id,
  wallet: dto.wallet,
  capAmount: dto.cap_amount,
  currency: dto.currency,
  spent: dto.spent,
  status: toKnown(dto.status, GRANT_STATUSES),
  interactRef: dto.interact_ref ?? null,
  hashState: toKnown(dto.hash_state, HASH_STATES),
  tokenMasked: dto.token_masked ?? null,
  createdAt: dto.created_at,
  approvedAt: dto.approved_at ?? null,
  revokedAt: dto.revoked_at ?? null,
  revocationReason: dto.revocation_reason ? toKnown(dto.revocation_reason, REVOCATION_REASONS) : null,
  revocation: dto.revocation
    ? {
        cap: dto.revocation.cap,
        spent: dto.revocation.spent,
        remainingInWallet: dto.revocation.remaining_in_wallet,
        deleteResponseStatus: dto.revocation.delete_response_status,
      }
    : null,
});

const fromEventDto = (dto: GrantEventDto): GrantEvent => ({
  id: dto.id,
  grantId: dto.grant_id,
  type: toKnown(dto.type, GRANT_EVENT_TYPES),
  actor: toKnown(dto.actor, GRANT_ACTORS),
  at: dto.at,
  detail: dto.detail,
});

const fromSpendDto = (dto: SpendEventDto): GrantSpendEvent => ({
  id: dto.id,
  grantId: dto.grant_id,
  idempotencyKey: dto.idempotency_key,
  lineId: dto.line_id,
  concept: dto.concept,
  beneficiary: dto.beneficiary,
  beneficiaryWallet: dto.beneficiary_wallet,
  received: dto.received,
  fee: dto.fee,
  debited: dto.debited,
  spentBefore: dto.spent_before,
  spentAfter: dto.spent_after,
  incomingPaymentId: dto.incoming_payment_id,
  outgoingPaymentId: dto.outgoing_payment_id,
  createdAt: dto.created_at,
});

const fromProjectDto = (dto: GrantProjectDto): GrantProjectRef => ({ id: dto.id, title: dto.title, currency: dto.currency });

const fromMilestoneDto = (dto: GrantMilestoneDto): GrantMilestoneRef => ({
  id: dto.id,
  sequenceOrder: dto.sequence_order,
  title: dto.title,
  status: dto.status,
  budget: dto.budget,
  estimatedCompletionDate: dto.estimated_completion_date ?? null,
});

const fromViewDto = (dto: { grant: GrantDto; project: GrantProjectDto; milestone: GrantMilestoneDto }): GrantView => ({
  grant: fromGrantDto(dto.grant),
  project: fromProjectDto(dto.project),
  milestone: fromMilestoneDto(dto.milestone),
});

export const toGrant = (data: unknown): MilestoneGrant => fromGrantDto(parse(grantDtoSchema, data, "grant"));

export function toInvestorGrants(data: unknown): InvestorGrantsView {
  const dto = parse(investorGrantsDtoSchema, data, "investor grants");
  return { grants: dto.grants.map(fromViewDto), projects: dto.projects.map(fromProjectDto) };
}

export function toProjectGrants(data: unknown): ProjectGrantsView {
  const dto = parse(projectGrantsDtoSchema, data, "project grants");
  return { project: fromProjectDto(dto.project), milestones: dto.milestones.map(fromMilestoneDto), grants: dto.grants.map(fromGrantDto) };
}

export function toGrantDetail(data: unknown): GrantDetail {
  const dto = parse(grantDetailDtoSchema, data, "grant detail");
  return { ...fromViewDto(dto), events: dto.events.map(fromEventDto), receipts: dto.receipts.map(fromSpendDto) };
}

export function toSpendResult(data: unknown): SpendResult {
  const dto = parse(spendResultDtoSchema, data, "spend result");
  return { receipt: fromSpendDto(dto.receipt), replayed: dto.replayed };
}

export function toWalletConsent(data: unknown): WalletConsent {
  const dto = parse(consentDtoSchema, data, "wallet consent");
  return { interactRef: dto.interact_ref, hash: dto.hash };
}
