import { Injectable } from "@nestjs/common";
import { NotFoundError } from "../../../shared/domain-errors";
import type { Milestone } from "./milestone";
import { MilestoneRepository } from "../ports/milestone.repository";

// Load → apply a business rule → save. Every write use case is exactly this.
@Injectable()
export class MilestoneStore {
  constructor(private readonly milestones: MilestoneRepository) {}

  async get(id: string): Promise<Milestone> {
    const milestone = await this.milestones.findById(id);
    if (!milestone) throw new NotFoundError(`Milestone ${id} not found`);
    return milestone;
  }

  async update(id: string, change: (m: Milestone) => Milestone): Promise<Milestone> {
    const next = change(await this.get(id));
    await this.milestones.save(next);
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
