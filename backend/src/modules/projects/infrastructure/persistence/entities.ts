import { ProjectEntity } from "./project.entity";

/** Registered with TypeOrmModule.forFeature, so autoLoadEntities picks them up. */
export const PROJECT_ENTITIES = [ProjectEntity];
