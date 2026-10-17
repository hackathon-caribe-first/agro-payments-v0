import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthModule } from "../auth/auth.module";
import { InvestmentsModule } from "../investments/investments.module";
import { MilestonesModule } from "../milestones/milestones.module";
import { ProjectsModule } from "../projects/projects.module";
import { SettlementUseCases } from "./application/settlement.use-cases";
import { SettlementController } from "./controllers/settlement.controller";
import { TypeOrmSettlementAdapter } from "./infrastructure/persistence/typeorm-settlement.adapter";
import { SettlementRepository } from "./ports/settlement.repository";

// RF-26 liquidation cascade. Pays through the milestones' PaymentGateway (simulated or open-payments, per PAYMENT_GATEWAY)
// and pays the producer and platform to the same wallets new project milestones use. Investors default to the captured investments.
@Module({
  imports: [AuthModule, MilestonesModule, ProjectsModule, InvestmentsModule],
  controllers: [SettlementController],
  providers: [SettlementUseCases, { provide: SettlementRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmSettlementAdapter(dataSource) }],
})
export class SettlementModule {}
