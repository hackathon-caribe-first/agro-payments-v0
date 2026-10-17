import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AssistantModule } from "../assistant/assistant.module";
import { AuthModule } from "../auth/auth.module";
import { DomainEvents } from "../../shared/events/domain-events";
import { MilestoneStore } from "../milestones/application/milestone-store";
import type { OpenPayments } from "../milestones/infrastructure/adapters/open-payments.client";
import { OPEN_PAYMENTS, MilestonesModule } from "../milestones/milestones.module";
import { MilestoneRepository } from "../milestones/ports/milestone.repository";
import { OrderApprovalUseCases } from "./application/order-approval.use-cases";
import { SuppliersUseCases } from "./application/suppliers.use-cases";
import { PayoutsController } from "./controllers/payouts.controller";
import { PostgresSupplierRepository } from "./infrastructure/postgres-supplier.repository";
import { OpenPaymentsWalletDirectory, SimulatedWalletDirectory } from "./infrastructure/wallet-directory.adapters";
import { SupplierRepository } from "./ports/supplier.repository";
import { WalletDirectory } from "./ports/wallet-directory";

// Custody payouts (PRD v3 RF-15/RF-16): supplier registry and the approval of the assistant's confirmed orders into proveedor
// lines. A leaf module: it reads the assistant only through its exported OrderIntents port.
@Module({
  imports: [AuthModule, MilestonesModule, AssistantModule],
  controllers: [PayoutsController],
  providers: [
    SuppliersUseCases,
    OrderApprovalUseCases,
    {
      provide: MilestoneStore,
      // RF-37: supplier lines paid from here also publish line.paid (DomainEvents is global, EventsModule).
      inject: [MilestoneRepository, { token: DomainEvents, optional: true }],
      useFactory: (milestones: MilestoneRepository, events?: DomainEvents) => new MilestoneStore(milestones, events),
    },
    { provide: SupplierRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresSupplierRepository(dataSource) },
    {
      provide: WalletDirectory,
      inject: [OPEN_PAYMENTS],
      useFactory: (op: OpenPayments | null) => (op ? new OpenPaymentsWalletDirectory(op) : new SimulatedWalletDirectory()),
    },
  ],
})
export class PayoutsModule {}
