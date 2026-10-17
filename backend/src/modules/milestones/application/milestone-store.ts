import { Injectable, Optional } from "@nestjs/common";
import { NotFoundError } from "../../../shared/domain-errors";
import { DomainEvents, publishAll } from "../../../shared/events/domain-events";
import { milestoneEvents } from "./milestone-events";
import type { Milestone } from "./milestone";
import { MilestoneRepository } from "../ports/milestone.repository";

// Load → apply a business rule → save. Every write use case is exactly this.
@Injectable()
export class MilestoneStore {
  constructor(
    private readonly milestones: MilestoneRepository,
    // RF-37: what each write changed (line paid, verdict, evidence) is published after it is saved.
    @Optional() private readonly events?: DomainEvents,
  ) {}

  async get(id: string): Promise<Milestone> {
    const milestone = await this.milestones.findById(id);
    if (!milestone) throw new NotFoundError(`Milestone ${id} not found`);
    return milestone;
  }

  async update(id: string, change: (m: Milestone) => Milestone): Promise<Milestone> {
    const prev = await this.get(id);
    const next = change(prev);
    await this.milestones.save(next);
    publishAll(this.events, milestoneEvents(prev, next));
    return next;
  }

  list() {
    return this.milestones.findAll();
  }

  /** Ordered by sequenceOrder. */
  listProject(projectId: string) {
    return this.milestones.findByProject(projectId);
  }
}
