import { Global, Module } from "@nestjs/common";
import { DomainEvents, InProcessDomainEvents } from "./domain-events";

// Global so any use case can take DomainEvents (as @Optional) without its module importing the subscribers.
@Global()
@Module({
  providers: [{ provide: DomainEvents, useValue: new InProcessDomainEvents() }],
  exports: [DomainEvents],
})
export class EventsModule {}
