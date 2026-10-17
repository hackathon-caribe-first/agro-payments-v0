import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { loadEnv } from "../../shared/config/env";
import { AuthModule } from "../auth/auth.module";
import { ContractsModule } from "../contracts/contracts.module";
import type { OpenPayments } from "../milestones/infrastructure/adapters/open-payments.client";
import { MilestonesModule, OPEN_PAYMENTS } from "../milestones/milestones.module";
import { PaymentStepRepository } from "../support/ports/payment-step.repository";
import { SupportModule } from "../support/support.module";
import { CLOCK, type Clock, NegotiationsService } from "./application/negotiations.service";
import { DEPOSIT_WEB_APP_URL, DepositCallbackController } from "./controllers/deposit-callback.controller";
import { NegotiationsController } from "./controllers/negotiations.controller";
import { OpenPaymentsCustodyDeposit } from "./infrastructure/adapters/open-payments-custody-deposit.adapter";
import { SimulatedCustodyDeposit } from "./infrastructure/adapters/simulated-custody-deposit.adapter";
import { TypeOrmNegotiationStore } from "./infrastructure/persistence/typeorm-negotiation-store.adapter";
import { CustodyDeposit } from "./ports/custody-deposit";
import { NegotiationStore } from "./ports/negotiation-store";

// Block 3: the buyer side of the web app — catalog, project and open-request negotiations, and the custody deposit.
// The deposit adapter follows PAYMENT_GATEWAY: simulated (synchronous, like the mock) or open-payments (buyer wallet → custody wallet).
@Module({
  imports: [AuthModule, MilestonesModule, ContractsModule, SupportModule],
  controllers: [NegotiationsController, DepositCallbackController],
  providers: [
    NegotiationsService,
    { provide: CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    { provide: DEPOSIT_WEB_APP_URL, useFactory: () => loadEnv().webOrigins[0] },
    { provide: NegotiationStore, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmNegotiationStore(dataSource) },
    {
      provide: CustodyDeposit,
      inject: [OPEN_PAYMENTS, PaymentStepRepository],
      useFactory: (op: OpenPayments | null, steps: PaymentStepRepository) => {
        const { openPayments, apiUrl } = loadEnv();
        return op && openPayments ? new OpenPaymentsCustodyDeposit(op, openPayments.buyerWalletAddress, apiUrl, steps) : new SimulatedCustodyDeposit();
      },
    },
  ],
})
export class NegotiationsModule {}
