import { Module } from "@nestjs/common";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { HarvestModule } from "./modules/harvest/harvest.module";
import { InvestmentsModule } from "./modules/investments/investments.module";
import { MilestonesModule } from "./modules/milestones/milestones.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { NegotiationsModule } from "./modules/negotiations/negotiations.module";
import { PayoutsModule } from "./modules/payouts/payouts.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SettlementModule } from "./modules/settlement/settlement.module";
import { SimulationModule } from "./modules/simulation/simulation.module";
import { SupportModule } from "./modules/support/support.module";

import { AuthModule } from "./modules/auth/auth.module";
import { DatabaseModule } from "./shared/database/database.module";
import { EventsModule } from "./shared/events/events.module";

@Module({
  imports: [
    DatabaseModule,
    EventsModule,
    AuthModule,
    MilestonesModule,
    ProjectsModule,
    NegotiationsModule,
    InvestmentsModule,
    SettlementModule,
    SimulationModule,
    ContractsModule,
    AssistantModule,
    PayoutsModule,
    HarvestModule,
    SupportModule,
    NotificationsModule,
  ],
})
export class AppModule {}
