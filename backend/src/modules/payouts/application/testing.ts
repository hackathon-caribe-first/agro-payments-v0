// Test doubles shared by the payouts specs.
import { DomainError } from "../../../shared/domain-errors";
import { decideOrder, type OrderDecision, type OrderIntent, toOrderIntent } from "../../assistant/application/order-intents";
import { INTENT_STATUS, INTENT_TYPE, type Intent } from "../../assistant/application/assistant";
import { OrderIntents } from "../../assistant/ports/order-intents";
import { SupplierRepository } from "../ports/supplier.repository";
import { type WalletInfo, WalletDirectory } from "../ports/wallet-directory";
import type { Supplier } from "./supplier";

export class InMemorySupplierRepository extends SupplierRepository {
  readonly suppliers: Supplier[] = [];
  async save(s: Supplier) {
    this.suppliers.push(s);
  }
  async findAll() {
    return [...this.suppliers];
  }
  async findById(id: string) {
    return this.suppliers.find((s) => s.id === id) ?? null;
  }
  async findByName(name: string) {
    return this.suppliers.find((s) => s.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
  }
}

/** Wallets by URL; anything else does not resolve. */
export class FakeWalletDirectory extends WalletDirectory {
  constructor(private readonly wallets: Record<string, Omit<WalletInfo, "id">>) {
    super();
  }
  async lookup(walletAddress: string) {
    const w = this.wallets[walletAddress];
    return w ? { id: walletAddress, ...w } : null;
  }
}

export const orderIntent = (id: string, milestoneId: string, total: number, supplier = "Almacén Don Pedro"): Intent => ({
  id,
  conversationId: "c-1",
  userId: "u-prod",
  type: INTENT_TYPE.ORDER_LINE,
  data: { milestoneId, milestoneTitle: "Fertilización", supplier, product: "urea", quantity: 1, unit: "bultos", unitPrice: total, total },
  summary: "Orden",
  requiresPin: true,
  status: INTENT_STATUS.CONFIRMED,
  createdAt: new Date("2026-10-17T10:00:00Z"),
  decidedAt: new Date("2026-10-17T10:01:00Z"),
  decidedBy: "u-prod",
  result: { operatorApproval: "pending" },
});

export class InMemoryOrderIntents extends OrderIntents {
  constructor(readonly intents: Intent[]) {
    super();
  }
  async listForMilestone(milestoneId: string) {
    return this.intents.map(toOrderIntent).filter((o): o is OrderIntent => o?.milestoneId === milestoneId);
  }
  async find(id: string) {
    const intent = this.intents.find((i) => i.id === id);
    return intent ? toOrderIntent(intent) : null;
  }
  async decide(id: string, decision: OrderDecision) {
    const index = this.intents.findIndex((i) => i.id === id);
    if (index < 0) throw new DomainError(`Order ${id} not found`);
    this.intents[index] = decideOrder(this.intents[index], decision);
    return toOrderIntent(this.intents[index])!;
  }
}
