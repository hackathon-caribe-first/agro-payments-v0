// RF-37: a small in-process domain event bus. Use cases publish facts; subscribers (NotificationsModule) turn them into notices.
// Publishing never waits for nor fails on a subscriber: handlers run after the current tick and their errors are only logged.
import { Logger } from "@nestjs/common";

export type Location = { latitude: number; longitude: number };

export type DomainEvent =
  /** The project's custody reached its target (FUNDED_IN_CUSTODY): the project is active. */
  | { type: "project.funded"; projectId: string }
  /** A payment line settled (completado). Amount in minor units of currency/assetScale. */
  | {
      type: "line.paid";
      projectId: string | null;
      milestoneId: string;
      milestoneTitle: string;
      lineId: string;
      kind: string;
      beneficiary: string;
      amount: number;
      currency: string;
      assetScale: number;
    }
  | { type: "milestone.approved"; projectId: string | null; milestoneId: string; milestoneTitle: string }
  /** The verifier's verdict "observado" with their reason as written. */
  | { type: "milestone.observed"; projectId: string | null; milestoneId: string; milestoneTitle: string; reason: string | null }
  /** RF-19/RF-35: new field evidence (a log) or the milestone sent to review; the verifier is told. */
  | {
      type: "evidence.recorded";
      projectId: string | null;
      milestoneId: string;
      milestoneTitle: string;
      stage: "log" | "submitted";
      photoCount: number;
      location: Location | null;
    }
  | { type: "settlement.executed"; projectId: string; settlementId: string }
  /** RF-37: the assistant did not understand (or refused) and flagged the conversation for a technician. */
  | { type: "assistant.escalated"; userId: string; conversationId: string; lastUserMessage: string };

export type DomainEventHandler = (event: DomainEvent) => Promise<void> | void;

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class DomainEvents {
  abstract publish(event: DomainEvent): void;
  abstract subscribe(handler: DomainEventHandler): void;
}

export class InProcessDomainEvents extends DomainEvents {
  private readonly logger = new Logger("DomainEvents");
  private readonly handlers: DomainEventHandler[] = [];
  private inFlight: Promise<unknown>[] = [];

  subscribe(handler: DomainEventHandler) {
    this.handlers.push(handler);
  }

  publish(event: DomainEvent) {
    for (const handler of this.handlers) {
      const run = new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => handler(event))
        .catch((error: unknown) => this.logger.warn(`${event.type} handler failed: ${error instanceof Error ? error.message : String(error)}`));
      this.inFlight.push(run);
      void run.finally(() => {
        this.inFlight = this.inFlight.filter((p) => p !== run);
      });
    }
  }

  /** Waits for every handler started so far (specs and graceful shutdown). */
  async drain() {
    while (this.inFlight.length > 0) await Promise.all(this.inFlight);
  }
}

/** Publishes each event when a bus is wired (the use cases keep working without one, e.g. in older specs). */
export const publishAll = (events: DomainEvents | null | undefined, list: DomainEvent[]) => {
  if (events) for (const event of list) events.publish(event);
};
