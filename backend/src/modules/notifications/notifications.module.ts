import { Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AssistantModule } from "../assistant/assistant.module";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { NotificationsService } from "./application/notifications";
import { NotificationsController } from "./controllers/notifications.controller";
import { PostgresNotificationRepository } from "./infrastructure/postgres-notification.repository";
import { NotificationRepository } from "./ports/notification.repository";

// RF-37 notices. Depends on the modules it reads (projects) and speaks through (assistant); nothing depends on it:
// the use cases only publish DomainEvents (EventsModule, global).
@Module({
  imports: [AuthModule, ProjectsModule, AssistantModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NotificationRepository, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresNotificationRepository(dataSource) },
  ],
})
export class NotificationsModule {}
