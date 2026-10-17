import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { loadEnv } from "../../shared/config/env";
import { AuthModule } from "../auth/auth.module";
import type { OpenPayments } from "../milestones/infrastructure/adapters/open-payments.client";
import { MilestonesModule, OPEN_PAYMENTS } from "../milestones/milestones.module";
import { PaymentStepRepository } from "../support/ports/payment-step.repository";
import { SupportModule } from "../support/support.module";
import { type Clock, HARVEST_CLOCK, HarvestUseCases } from "./application/harvest.use-cases";
import { InvestorPanelUseCases } from "./application/investor-panel.use-cases";
import { HARVEST_WEB_APP_URL, HarvestPaymentCallbackController } from "./controllers/harvest-payment-callback.controller";
import { HarvestController } from "./controllers/harvest.controller";
import { OpenPaymentsHarvestPayment } from "./infrastructure/adapters/open-payments-harvest-payment.adapter";
import { SimulatedHarvestPayment } from "./infrastructure/adapters/simulated-harvest-payment.adapter";
import { TypeOrmHarvestStore } from "./infrastructure/persistence/typeorm-harvest-store.adapter";
import { TypeOrmPanelSources } from "./infrastructure/persistence/typeorm-panel-sources.adapter";
import { HarvestPayment } from "./ports/harvest-payment";
import { HarvestStore } from "./ports/harvest-store";
import { PanelSources } from "./ports/panel-sources";

// PRD v3 Fase 3: harvest (RF-24), custody balance (RF-21) and the investor panel (RF-27). The payment adapter follows
// PAYMENT_GATEWAY like the buyer's deposit: simulated (synchronous) or open-payments (buyer wallet → custody wallet).
// PurchaseContractPrice is not provided yet (another branch adds purchase contracts): certification takes the request's price.
@Module({
  imports: [AuthModule, MilestonesModule, SupportModule],
  controllers: [HarvestController, HarvestPaymentCallbackController],
  providers: [
    HarvestUseCases,
    InvestorPanelUseCases,
    { provide: HARVEST_CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    { provide: HARVEST_WEB_APP_URL, useFactory: () => loadEnv().webOrigins[0] },
    { provide: HarvestStore, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmHarvestStore(dataSource) },
    { provide: PanelSources, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmPanelSources(dataSource) },
    {
      provide: HarvestPayment,
      inject: [OPEN_PAYMENTS, PaymentStepRepository],
      useFactory: (op: OpenPayments | null, steps: PaymentStepRepository) => {
        const { openPayments, apiUrl } = loadEnv();
        return op && openPayments ? new OpenPaymentsHarvestPayment(op, openPayments.buyerWalletAddress, apiUrl, steps) : new SimulatedHarvestPayment();
      },
    },
  ],
})
export class HarvestModule {}
