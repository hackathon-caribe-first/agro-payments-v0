import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { loadEnv } from "../../shared/config/env";
import { AuthModule } from "../auth/auth.module";
import { UserDirectory } from "../auth/ports/user-directory";
import { WEB_APP_URL } from "../milestones/controllers/milestone-funding-callback.controller";
import type { OpenPayments } from "../milestones/infrastructure/adapters/open-payments.client";
import { MilestonesModule, OPEN_PAYMENTS } from "../milestones/milestones.module";
import { MilestoneRepository } from "../milestones/ports/milestone.repository";
import { PaymentGateway } from "../milestones/ports/payment-gateway";
import { OpenPaymentsWalletDirectory, SimulatedWalletDirectory } from "../payouts/infrastructure/wallet-directory.adapters";
import { WalletDirectory } from "../payouts/ports/wallet-directory";
import { ProjectsModule } from "../projects/projects.module";
import { ProjectRepository } from "../projects/ports/project.repository";
import { TypeOrmSimulationRunAdapter } from "../simulation/infrastructure/persistence/typeorm-simulation-run.adapter";
import { SimulationRunRepository } from "../simulation/ports/simulation-run.repository";
import { ContractsUseCases } from "./application/contracts.use-cases";
import { ContractsController } from "./controllers/contracts.controller";
import { PremiumGrantCallbackController } from "./controllers/premium-grant-callback.controller";
import { OpenPaymentsIndemnityInflow } from "./infrastructure/adapters/open-payments-indemnity-inflow.adapter";
import { OpenPaymentsPremiumFunding } from "./infrastructure/adapters/open-payments-premium-funding.adapter";
import { SimulatedIndemnityInflow } from "./infrastructure/adapters/simulated-indemnity-inflow.adapter";
import { SimulatedPremiumFunding } from "./infrastructure/adapters/simulated-premium-funding.adapter";
import { PostgresContractsStore } from "./infrastructure/persistence/postgres-contracts-store.adapter";
import { ContractsStore } from "./ports/contracts-store";
import { IndemnityInflow } from "./ports/indemnity-inflow";
import { PremiumFunding } from "./ports/premium-funding";
import { PurchaseContracts } from "./ports/purchase-contracts";

// RF-04, RF-05, RF-09, RF-14, RF-25. Pays the premium through the milestones' PaymentGateway (simulated or open-payments, per
// PAYMENT_GATEWAY) from the fiduciaria's premium grant on custody. Reads simulation runs with its own adapter instance (the
// simulation module imports this one for the publish gate, so importing it back would be circular).
// Exports PurchaseContracts for the RF-07 publish gate.
@Module({
  imports: [AuthModule, MilestonesModule, ProjectsModule],
  controllers: [ContractsController, PremiumGrantCallbackController],
  providers: [
    { provide: WEB_APP_URL, useFactory: () => loadEnv().webOrigins[0] },
    { provide: ContractsStore, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresContractsStore(dataSource) },
    { provide: SimulationRunRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmSimulationRunAdapter(dataSource) },
    {
      provide: WalletDirectory,
      inject: [OPEN_PAYMENTS],
      useFactory: (op: OpenPayments | null) => (op ? new OpenPaymentsWalletDirectory(op) : new SimulatedWalletDirectory()),
    },
    {
      provide: PremiumFunding,
      inject: [OPEN_PAYMENTS],
      useFactory: (op: OpenPayments | null) => (op ? new OpenPaymentsPremiumFunding(op, loadEnv().apiUrl) : new SimulatedPremiumFunding()),
    },
    { provide: IndemnityInflow, inject: [OPEN_PAYMENTS], useFactory: (op: OpenPayments | null) => (op ? new OpenPaymentsIndemnityInflow(op) : new SimulatedIndemnityInflow()) },
    {
      provide: ContractsUseCases,
      inject: [ProjectRepository, MilestoneRepository, ContractsStore, SimulationRunRepository, UserDirectory, WalletDirectory, PaymentGateway, PremiumFunding, IndemnityInflow],
      useFactory: (...deps: ConstructorParameters<typeof ContractsUseCases>) => new ContractsUseCases(...deps),
    },
    {
      provide: PurchaseContracts,
      inject: [ContractsStore],
      useFactory: (store: ContractsStore): PurchaseContracts => ({
        exists: async (id: string) => (await store.findPurchaseContract(id)) !== null,
        buyerWalletAddress: async (id: string) => (await store.findPurchaseContract(id))?.buyerWalletAddress ?? null,
      }),
    },
  ],
  exports: [PurchaseContracts],
})
export class ContractsModule {}
