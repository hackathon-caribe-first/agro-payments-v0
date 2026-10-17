import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthModule } from "../auth/auth.module";
import { ContractsModule } from "../contracts/contracts.module";
import { ProjectsModule } from "../projects/projects.module";
import { AdmissionUseCases } from "./application/admission";
import { SimulationUseCases } from "./application/simulation.use-cases";
import { AdmissionController } from "./controllers/admission.controller";
import { SimulationController } from "./controllers/simulation.controller";
import { PostgresAdmissionRepository } from "./infrastructure/persistence/postgres-admission.repository";
import { TypeOrmSimulationRunAdapter } from "./infrastructure/persistence/typeorm-simulation-run.adapter";
import { AdmissionRepository } from "./ports/admission.repository";
import { SimulationRunRepository } from "./ports/simulation-run.repository";

// RF-02/RF-03 admission (A15) and RF-06/RF-07: the Fase 0 motor (pure, application/motor.ts), its stored runs and the
// publication gate (which also needs the RF-04 purchase contract, read through ContractsModule's PurchaseContracts).
@Module({
  imports: [AuthModule, ProjectsModule, ContractsModule],
  controllers: [SimulationController, AdmissionController],
  providers: [
    SimulationUseCases,
    AdmissionUseCases,
    { provide: SimulationRunRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new TypeOrmSimulationRunAdapter(dataSource) },
    { provide: AdmissionRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresAdmissionRepository(dataSource) },
  ],
})
export class SimulationModule {}
