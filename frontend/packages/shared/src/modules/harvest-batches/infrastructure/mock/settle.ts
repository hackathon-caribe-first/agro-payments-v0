import { INVESTOR_IDENTITY } from "../../../presales/infrastructure/mock/identities";
import { computeLiquidation, liquidationBalances } from "../../domain/liquidation";
import type { OrderDto, SettlementDto } from "../dto";

export const PLATFORM_NAME = "Surco";
export const INVESTOR_NAME = INVESTOR_IDENTITY.name;

type Line = SettlementDto["lines"][number];

// Builds the settlement the platform executes once reception is confirmed: one independent payment per line, each with its
// own state and receipt, then the proof that the order grant was revoked. Zero-amount lines are never paid.
export function buildSettlement(order: OrderDto, ids: { next: (prefix: string) => string }, now: string): SettlementDto {
  const liquidation = computeLiquidation({
    total: order.total,
    platformFeeBp: order.platform_fee_bp,
    capitalDue: order.capital_due,
    yieldDue: order.yield_due,
  });
  // Invariant: sum of lines == order total. A violation is a programming error, never a silent mismatch.
  if (!liquidationBalances(liquidation, order.total)) throw new Error("Settlement lines do not add up to the order total");

  const draft: Array<[Line["kind"], string, number]> = [
    ["PLATFORM_FEE", PLATFORM_NAME, liquidation.platformFee],
    ["INVESTOR_CAPITAL", INVESTOR_NAME, liquidation.investorCapital],
    ["INVESTOR_YIELD", INVESTOR_NAME, liquidation.investorYield],
    ["PRODUCER_NET", order.producer_name, liquidation.producerNet],
  ];
  const lines: Line[] = draft
    .filter(([, , amount]) => amount > 0)
    .map(([kind, beneficiary, amount]) => ({
      id: ids.next("sl"),
      kind,
      beneficiary_name: beneficiary,
      amount,
      state: "completado",
      incoming_payment_id: ids.next("inc"),
      outgoing_payment_id: ids.next("out"),
      receipt_id: ids.next("rcp"),
      executed_at: now,
    }));

  return {
    id: ids.next("stl"),
    order_id: order.id,
    project_id: order.project_id,
    project_title: order.project_title,
    buyer_name: order.buyer_name,
    currency: order.currency,
    total: order.total,
    platform_fee_bp: order.platform_fee_bp,
    capital_due: order.capital_due,
    yield_due: order.yield_due,
    status: "COMPLETED",
    loss: liquidation.loss,
    shortfall: liquidation.shortfall,
    lines,
    revocation: { revoked_at: now, response_status: 204, cap: order.grant.cap, spent: order.total, remaining: order.grant.cap - order.total },
    created_at: now,
  };
}
