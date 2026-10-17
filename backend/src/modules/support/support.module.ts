import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuthModule } from "../auth/auth.module";
import { SupportController } from "./controllers/support.controller";
import { PostgresOpTraceRepository } from "./infrastructure/postgres-op-trace.repository";
import { OpTraceRepository } from "./ports/op-trace.repository";

// RF-28 support trace. MilestonesModule imports this one to wrap the Open Payments client (no reverse dependency).
@Module({
  imports: [AuthModule],
  controllers: [SupportController],
  providers: [{ provide: OpTraceRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresOpTraceRepository(dataSource) }],
  exports: [OpTraceRepository],
})
export class SupportModule {}
