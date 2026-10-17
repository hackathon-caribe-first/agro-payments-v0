import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { loadEnv } from "../../shared/config/env";
import { AuthModule } from "../auth/auth.module";
import type { OpenPayments } from "../milestones/infrastructure/adapters/open-payments.client";
import { MilestonesModule, OPEN_PAYMENTS } from "../milestones/milestones.module";
import { PaymentStepRepository } from "../support/ports/payment-step.repository";
import { SupportModule } from "../support/support.module";
import { CapturedInvestors } from "../settlement/ports/captured-investors";
import { type Clock, INVESTMENT_CLOCK, InvestmentUseCases } from "./application/investments.use-cases";
import { INVESTMENT_WEB_APP_URL, InvestmentCallbackController } from "./controllers/investment-callback.controller";
import { InvestmentsController } from "./controllers/investments.controller";
import { OpenPaymentsInvestmentCapture } from "./infrastructure/adapters/open-payments-investment-capture.adapter";
import { SimulatedInvestmentCapture } from "./infrastructure/adapters/simulated-investment-capture.adapter";
import { TypeOrmInvestmentStore } from "./infrastructure/persistence/typeorm-investment-store.adapter";
import { InvestmentCapture } from "./ports/investment-capture";
import { InvestmentStore } from "./ports/investment-store";

// Block 4: investor capture into custody (RF-10, RF-29). The capture adapter follows PAYMENT_GATEWAY: simulated (synchronous,
// fixed demo rates) or open-payments (investor wallet → custody wallet, quote with the COP receive side fixed).
// Exports CapturedInvestors so the settlement cascade reads its capital tier from the captured investments.
@Module({
  imports: [AuthModule, MilestonesModule, SupportModule],
  controllers: [InvestmentsController, InvestmentCallbackController],
  providers: [
    InvestmentUseCases,
    { provide: INVESTMENT_CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    { provide: INVESTMENT_WEB_APP_URL, useFactory: () => loadEnv().webOrigins[0] },
    { provide: InvestmentStore, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmInvestmentStore(dataSource) },
    {
      provide: InvestmentCapture,
      inject: [OPEN_PAYMENTS, PaymentStepRepository],
      useFactory: (op: OpenPayments | null, steps: PaymentStepRepository) =>
        op ? new OpenPaymentsInvestmentCapture(op, loadEnv().apiUrl, undefined, steps) : new SimulatedInvestmentCapture(),
    },
    {
      provide: CapturedInvestors,
      inject: [InvestmentUseCases],
      useFactory: (useCases: InvestmentUseCases): CapturedInvestors => ({
        forProject: (id: string) => useCases.capturedPositions(id),
        investmentIdsOf: (id: string, investorUserId: string) => useCases.investmentIdsOf(id, investorUserId),
      }),
    },
  ],
  exports: [CapturedInvestors],
})
export class InvestmentsModule {}
