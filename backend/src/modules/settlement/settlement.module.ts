import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthModule } from "../auth/auth.module";
import { InvestmentsModule } from "../investments/investments.module";
import { MilestonesModule } from "../milestones/milestones.module";
import { ProjectsModule } from "../projects/projects.module";
import { SupportModule } from "../support/support.module";
import { SettlementUseCases } from "./application/settlement.use-cases";
import { loadEnv } from "../../shared/config/env";
import { WEB_APP_URL } from "../milestones/controllers/milestone-funding-callback.controller";
import { type OpenPayments } from "../milestones/infrastructure/adapters/open-payments.client";
import { OPEN_PAYMENTS } from "../milestones/milestones.module";
import { LiquidationGrantCallbackController } from "./controllers/liquidation-grant-callback.controller";
import { SettlementController } from "./controllers/settlement.controller";
import { OpenPaymentsLiquidationFunding } from "./infrastructure/adapters/open-payments-liquidation-funding.adapter";
import { SimulatedLiquidationFunding } from "./infrastructure/adapters/simulated-liquidation-funding.adapter";
import { LiquidationFunding } from "./ports/liquidation-funding";
import { TypeOrmSettlementAdapter } from "./infrastructure/persistence/typeorm-settlement.adapter";
import { SettlementRepository } from "./ports/settlement.repository";

// RF-26 liquidation cascade. Pays through the milestones' PaymentGateway (simulated or open-payments, per PAYMENT_GATEWAY),
// from the liquidation grant the fiduciaria approves on custody in open-payments mode,
// and pays the producer and platform to the same wallets new project milestones use. Investors default to the captured investments.
@Module({
  imports: [AuthModule, MilestonesModule, ProjectsModule, InvestmentsModule, SupportModule],
  controllers: [SettlementController, LiquidationGrantCallbackController],
  providers: [
    SettlementUseCases,
    { provide: SettlementRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmSettlementAdapter(dataSource) },
    { provide: WEB_APP_URL, useFactory: () => loadEnv().webOrigins[0] },
    // RF-26: open-payments mode needs the fiduciaria's liquidation grant on custody; simulated mode pays right away.
    {
      provide: LiquidationFunding,
      inject: [OPEN_PAYMENTS],
      useFactory: (op: OpenPayments | null) => (op ? new OpenPaymentsLiquidationFunding(op, loadEnv().apiUrl) : new SimulatedLiquidationFunding()),
    },
  ],
})
export class SettlementModule {}
