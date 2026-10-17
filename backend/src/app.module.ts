import { Module } from "@nestjs/common";
import { MilestonesModule } from "./modules/milestones/milestones.module";
import { NegotiationsModule } from "./modules/negotiations/negotiations.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { SettlementModule } from "./modules/settlement/settlement.module";

import { AuthModule } from "./modules/auth/auth.module";
import { DatabaseModule } from "./shared/database/database.module";

@Module({ imports: [DatabaseModule, AuthModule, MilestonesModule, ProjectsModule, NegotiationsModule, SettlementModule] })
export class AppModule {}
