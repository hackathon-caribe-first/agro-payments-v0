import { GrantEntity } from "./grant.entity";
import { MilestoneEntity, MilestoneLineEntity } from "./milestone.entity";

/** Registered with TypeOrmModule.forFeature, so autoLoadEntities picks them up. */
export const MILESTONE_ENTITIES = [MilestoneEntity, MilestoneLineEntity, GrantEntity];
