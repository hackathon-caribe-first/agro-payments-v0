import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { orderPayment } from "./milestone";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class OrderPaymentUseCase {
  constructor(private readonly store: MilestoneStore) {}

  execute(id: string) {
    const reference = `SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.store.update(id, (m) => orderPayment(m, reference, new Date()));
  }
}
