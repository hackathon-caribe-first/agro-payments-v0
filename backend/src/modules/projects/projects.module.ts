import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { loadEnv } from "../../shared/config/env";
import { AuthModule } from "../auth/auth.module";
import { placeholderWallet } from "../milestones/infrastructure/demo-milestones";
import { MilestonesModule } from "../milestones/milestones.module";
import { CreateProjectUseCase } from "./application/create-project.use-case";
import { MilestoneEvidenceUseCase } from "./application/milestone-evidence.use-case";
import { PROJECT_WALLETS, type ProjectWallets } from "./application/project-wallets";
import { ProjectQueries } from "./application/project-queries";
import { ProducerMilestonesController } from "./controllers/producer-milestones.controller";
import { ProjectsController } from "./controllers/projects.controller";
import { PROJECT_ENTITIES } from "./infrastructure/persistence/entities";
import { TypeOrmProjectAdapter } from "./infrastructure/persistence/typeorm-project.adapter";
import { ProjectRepository } from "./ports/project.repository";

// The /api surface the producer web app consumes. Milestones stay owned by MilestonesModule; this module adds projects
// and the PRD view of their milestones on top of the same aggregate and repository.
@Module({
  imports: [AuthModule, MilestonesModule, TypeOrmModule.forFeature(PROJECT_ENTITIES)],
  controllers: [ProjectsController, ProducerMilestonesController],
  providers: [
    ProjectQueries,
    CreateProjectUseCase,
    MilestoneEvidenceUseCase,
    { provide: ProjectRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmProjectAdapter(dataSource) },
    {
      provide: PROJECT_WALLETS,
      // ponytail: the web form captures no wallets yet, so every line pays one wallet: the testnet receiver in open-payments mode,
      // demo placeholders otherwise. Per-beneficiary wallets come with the supplier registry (RF-15) and producer onboarding (RF-01).
      // Lines are COP/2; in open-payments mode the receiver must hold COP or the gateway refuses the payment (no FX).
      useFactory: (): ProjectWallets => {
        const { openPayments } = loadEnv();
        if (openPayments) {
          const wallet = openPayments.receiverWalletAddress;
          return { producer: wallet, supplier: wallet, platform: wallet };
        }
        return { producer: placeholderWallet("productor"), supplier: placeholderWallet("proveedor"), platform: placeholderWallet("plataforma") };
      },
    },
  ],
  // The assistant module drives the same use cases (RF-38: same validations as the app).
  exports: [ProjectRepository, PROJECT_WALLETS, ProjectQueries, CreateProjectUseCase, MilestoneEvidenceUseCase],
})
export class ProjectsModule {}
