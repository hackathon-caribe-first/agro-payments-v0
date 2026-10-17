import { Module } from "@nestjs/common";
import { MilestonesModule } from "./modules/milestones/milestones.module";
import { ProjectsModule } from "./modules/projects/projects.module";

import { AuthModule } from "./modules/auth/auth.module";
import { DatabaseModule } from "./shared/database/database.module";

@Module({ imports: [DatabaseModule, AuthModule, MilestonesModule, ProjectsModule] })
export class AppModule {}
