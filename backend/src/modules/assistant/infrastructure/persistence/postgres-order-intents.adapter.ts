import type { DataSource } from "typeorm";
import { NotFoundError } from "../../../../shared/domain-errors";
import { INTENT_STATUS, INTENT_TYPE } from "../../application/assistant";
import { decideOrder, type OrderDecision, type OrderIntent, toOrderIntent } from "../../application/order-intents";
import type { AssistantStore } from "../../ports/assistant-store";
import { OrderIntents } from "../../ports/order-intents";
import { INTENT_COLUMNS, toIntent } from "./postgres-assistant-store.adapter";

// Reads confirmed ORDER_LINE intents by milestone straight from assistant_intents; writes go through the AssistantStore,
// which only ever updates the decision columns (the payload stays immutable audit).
// ponytail: decide() is read → check → write without a row lock; two approvals at the same instant could both pass the
// pending check. The milestone line id is derived from the intent id, so the second addSupplierLine is refused (409).
export class PostgresOrderIntents extends OrderIntents {
  constructor(
    private readonly dataSource: DataSource,
    private readonly store: AssistantStore,
  ) {
    super();
  }

  async listForMilestone(milestoneId: string): Promise<OrderIntent[]> {
    const rows: Record<string, unknown>[] = await this.dataSource.query(
      `SELECT ${INTENT_COLUMNS} FROM assistant_intents WHERE type = $1 AND status = $2 AND payload->>'milestoneId' = $3 ORDER BY seq`,
      [INTENT_TYPE.ORDER_LINE, INTENT_STATUS.CONFIRMED, milestoneId],
    );
    return rows.map((r) => toOrderIntent(toIntent(r))).filter((o): o is OrderIntent => o !== null);
  }

  async find(id: string): Promise<OrderIntent | null> {
    const intent = await this.store.findIntent(id);
    return intent ? toOrderIntent(intent) : null;
  }

  async decide(id: string, decision: OrderDecision): Promise<OrderIntent> {
    const intent = await this.store.findIntent(id);
    if (!intent) throw new NotFoundError(`Order ${id} not found`);
    const decided = decideOrder(intent, decision);
    await this.store.saveIntent(decided);
    return toOrderIntent(decided)!;
  }
}
