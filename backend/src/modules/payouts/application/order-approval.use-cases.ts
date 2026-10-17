import { Injectable } from "@nestjs/common";
import { DomainError, NotFoundError } from "../../../shared/domain-errors";
import { ORDER_APPROVAL, type OrderIntent } from "../../assistant/application/order-intents";
import { OrderIntents } from "../../assistant/ports/order-intents";
import { addSupplierLine, type Milestone } from "../../milestones/application/milestone";
import { MilestoneStore } from "../../milestones/application/milestone-store";
import { pesosToMinor } from "../../projects/application/project";
import { SupplierRepository } from "../ports/supplier.repository";

/** The approver may pick the registered supplier explicitly; otherwise the name the producer dictated must match one. */
export type ApproveOrderInput = { supplierId: string | null };

// RF-15/RF-16 sub-etapa A: the operator or fiduciaria turns a producer-confirmed order (RF-34) into a proveedor line,
// only while it fits the milestone's remaining cap. The assistant never creates lines (PRD principle 9).
@Injectable()
export class OrderApprovalUseCases {
  constructor(
    private readonly store: MilestoneStore,
    private readonly orders: OrderIntents,
    private readonly suppliers: SupplierRepository,
  ) {}

  async list(milestoneId: string): Promise<OrderIntent[]> {
    await this.store.get(milestoneId);
    return this.orders.listForMilestone(milestoneId);
  }

  private async pending(milestoneId: string, intentId: string): Promise<OrderIntent> {
    const order = await this.orders.find(intentId);
    if (!order || order.milestoneId !== milestoneId) throw new NotFoundError(`Order ${intentId} not found in milestone ${milestoneId}`);
    if (order.approval !== ORDER_APPROVAL.PENDING) throw new DomainError(`Order ${intentId} was already ${order.approval}`);
    return order;
  }

  async approve(milestoneId: string, intentId: string, input: ApproveOrderInput, approverId: string): Promise<{ order: OrderIntent; milestone: Milestone }> {
    const order = await this.pending(milestoneId, intentId);
    const supplier = input.supplierId ? await this.suppliers.findById(input.supplierId) : await this.suppliers.findByName(order.supplier);
    if (!supplier) throw new DomainError(`Supplier ${input.supplierId ?? order.supplier} is not registered; register it with its wallet first`);
    const lineId = `${milestoneId}-order-${intentId}`;
    // The line is saved first: a refused cap leaves the order pending, and a crash before decide() leaves a line the retry refuses (same id).
    // ponytail: "consolidación por proveedor" (one line per supplier) is not applied; each order is its own line.
    const milestone = await this.store.update(milestoneId, (m) =>
      addSupplierLine(m, { id: lineId, beneficiary: supplier.name, walletAddress: supplier.walletAddress, amount: pesosToMinor(order.total, m.assetScale) }),
    );
    const decided = await this.orders.decide(intentId, { approval: ORDER_APPROVAL.APPROVED, lineId, reason: null, by: approverId, at: new Date() });
    return { order: decided, milestone };
  }

  async reject(milestoneId: string, intentId: string, reason: string | null, approverId: string): Promise<OrderIntent> {
    await this.pending(milestoneId, intentId);
    return this.orders.decide(intentId, { approval: ORDER_APPROVAL.REJECTED, lineId: null, reason: reason?.trim() || null, by: approverId, at: new Date() });
  }
}
