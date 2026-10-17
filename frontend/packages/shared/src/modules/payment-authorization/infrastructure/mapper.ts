import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import { PAYMENT_AUTHORIZATION_STATUSES, type PaymentAuthorization } from "../domain/authorization";
import { paymentAuthorizationDtoSchema, type PaymentAuthorizationDto } from "./dto";

// Unknown values degrade to UNKNOWN instead of failing the whole response.
function toKnown<K extends string>(raw: string, known: readonly K[]): K | "UNKNOWN" {
  return (known as readonly string[]).includes(raw) ? (raw as K) : "UNKNOWN";
}

const fromDto = (dto: PaymentAuthorizationDto): PaymentAuthorization => ({
  id: dto.id,
  negotiationId: dto.negotiation_id,
  projectId: dto.project_id,
  buyerId: dto.buyer_id,
  cap: dto.cap,
  spent: dto.spent,
  currency: dto.currency,
  status: toKnown(dto.status, PAYMENT_AUTHORIZATION_STATUSES),
  createdAt: dto.created_at,
  revokedAt: dto.revoked_at ?? null,
});

export function toPaymentAuthorizations(data: unknown): PaymentAuthorization[] {
  const result = z.array(paymentAuthorizationDtoSchema).safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid payment authorizations: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data.map(fromDto);
}
