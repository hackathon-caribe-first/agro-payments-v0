import { Module } from "@nestjs/common";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { InvestmentsModule } from "./modules/investments/investments.module";
import { MilestonesModule } from "./modules/milestones/milestones.module";
import { NegotiationsModule } from "./modules/negotiations/negotiations.module";
import { PayoutsModule } from "./modules/payouts/payouts.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SettlementModule } from "./modules/settlement/settlement.module";
import { SimulationModule } from "./modules/simulation/simulation.module";

import { AuthModule } from "./modules/auth/auth.module";
import { DatabaseModule } from "./shared/database/database.module";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    MilestonesModule,
    ProjectsModule,
    NegotiationsModule,
    InvestmentsModule,
    SettlementModule,
    SimulationModule,
    AssistantModule,
    PayoutsModule,
  ],
})
export class AppModule {}
