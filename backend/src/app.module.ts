import { Module } from "@nestjs/common";
import { MilestonesModule } from "./modules/milestones/milestones.module";

import { AuthModule } from "./modules/auth/auth.module";
import { DatabaseModule } from "./shared/database/database.module";

@Module({ imports: [DatabaseModule, AuthModule, MilestonesModule] })
export class AppModule {}
