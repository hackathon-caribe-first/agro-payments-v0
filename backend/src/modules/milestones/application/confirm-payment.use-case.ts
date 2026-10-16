import { Injectable } from "@nestjs/common";
import { confirmPayment } from "./milestone";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class ConfirmPaymentUseCase {
  constructor(private readonly store: MilestoneStore) {}

  execute(id: string) {
    return this.store.update(id, (m) => confirmPayment(m, new Date()));
  }
}
