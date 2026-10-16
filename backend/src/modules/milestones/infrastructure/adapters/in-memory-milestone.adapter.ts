import { Injectable } from "@nestjs/common";
import type { Milestone } from "../../application/milestone";
import { MilestoneRepository } from "../../ports/milestone.repository";

const seed = (id: string, title: string, amount: number): Milestone => ({
  id,
  title,
  amount,
  currency: "COP",
  status: "draft",
  evidence: null,
  review: null,
  payment: null,
});

// ponytail: in-memory demo data, resets on restart; swap for a DB adapter in milestones.module.ts
@Injectable()
export class InMemoryMilestoneAdapter extends MilestoneRepository {
  private readonly milestones = new Map(
    [
      seed("preparacion-suelo", "Preparación del suelo", 4_500_000),
      seed("siembra", "Siembra", 6_000_000),
      seed("primera-fertilizacion", "Primera fertilización", 3_200_000),
    ].map((m) => [m.id, m]),
  );

  async findAll() {
    return [...this.milestones.values()];
  }

  async findById(id: string) {
    return this.milestones.get(id) ?? null;
  }

  async save(milestone: Milestone) {
    this.milestones.set(milestone.id, milestone);
  }
}
