import Anthropic from "@anthropic-ai/sdk";
import { Logger, Module } from "@nestjs/common";
import { DataSource } from "typeorm";
import { loadEnv } from "../../shared/config/env";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { ConverseUseCase, IntentDecisionUseCase } from "./application/assistant.use-cases";
import { ConversationInbox } from "./application/inbox";
import { PinUseCase } from "./application/pin";
import { AssistantTools } from "./application/tools";
import { AssistantController } from "./controllers/assistant.controller";
import { AnthropicAssistantModel } from "./infrastructure/anthropic-assistant-model.adapter";
import { PostgresAssistantStore, PostgresPinStore } from "./infrastructure/persistence/postgres-assistant-store.adapter";
import { PostgresOrderIntents } from "./infrastructure/persistence/postgres-order-intents.adapter";
import { UnavailableAssistantModel } from "./infrastructure/unavailable-assistant-model.adapter";
import { AssistantInbox } from "./ports/assistant-inbox";
import { AssistantModel } from "./ports/assistant-model";
import { AssistantStore, PinStore } from "./ports/assistant-store";
import { OrderIntents } from "./ports/order-intents";

// Producer assistant (PRD v3 RF-33..RF-41): Claude with four intent-only tools over the projects use cases. No path to payments.
@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [AssistantController],
  providers: [
    AssistantTools,
    PinUseCase,
    ConverseUseCase,
    IntentDecisionUseCase,
    { provide: AssistantInbox, useClass: ConversationInbox },
    { provide: AssistantStore, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresAssistantStore(dataSource) },
    { provide: PinStore, inject: [DataSource], useFactory: (dataSource: DataSource) => new PostgresPinStore(dataSource) },
    {
      provide: OrderIntents,
      inject: [DataSource, AssistantStore],
      useFactory: (dataSource: DataSource, store: AssistantStore) => new PostgresOrderIntents(dataSource, store),
    },
    {
      provide: AssistantModel,
      useFactory: (): AssistantModel => {
        const apiKey = loadEnv().anthropicApiKey;
        if (!apiKey) {
          new Logger("Assistant").warn("ANTHROPIC_API_KEY is not set: /api/assistant/messages answers 503.");
          return new UnavailableAssistantModel();
        }
        // RNF-08 asks for a status answer in under 5 s; one retry keeps a transient 529 from failing the turn.
        return new AnthropicAssistantModel(new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 }));
      },
    },
  ],
  // Confirmed order lines for the operator's approval (PayoutsModule); nothing else of the assistant leaves the module.
  // AssistantInbox: RF-37 notices (NotificationsModule) reach the producer's conversation through it.
  exports: [OrderIntents, AssistantInbox],
})
export class AssistantModule {}
