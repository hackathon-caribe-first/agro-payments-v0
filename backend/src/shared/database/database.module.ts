import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { loadEnv } from "../config/env";
import { MIGRATIONS } from "./migrations";

// TypeORM owns the domain tables only, evolved through migrations (never synchronize) that run at startup.
// Better Auth owns user/session/account/verification: do not declare entities for them.
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: "postgres",
        url: loadEnv().databaseUrl,
        autoLoadEntities: true,
        synchronize: false,
        migrations: MIGRATIONS,
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
