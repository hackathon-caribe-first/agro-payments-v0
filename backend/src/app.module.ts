import { Module } from "@nestjs/common";
import { MilestonesModule } from "./modules/milestones/milestones.module";

@Module({ imports: [MilestonesModule] })
export class AppModule {}
