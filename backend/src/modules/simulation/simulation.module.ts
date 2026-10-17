import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthModule } from "../auth/auth.module";
import { ContractsModule } from "../contracts/contracts.module";
import { ProjectsModule } from "../projects/projects.module";
import { SimulationUseCases } from "./application/simulation.use-cases";
import { SimulationController } from "./controllers/simulation.controller";
import { TypeOrmSimulationRunAdapter } from "./infrastructure/persistence/typeorm-simulation-run.adapter";
import { SimulationRunRepository } from "./ports/simulation-run.repository";

// RF-06/RF-07: the Fase 0 motor (pure, application/motor.ts), its stored runs and the publication gate (which also needs the
// RF-04 purchase contract, read through ContractsModule's PurchaseContracts).
@Module({
  imports: [AuthModule, ProjectsModule, ContractsModule],
  controllers: [SimulationController],
  providers: [SimulationUseCases, { provide: SimulationRunRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmSimulationRunAdapter(dataSource) }],
})
export class SimulationModule {}
