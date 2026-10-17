import { Injectable } from "@nestjs/common";
import { createMilestone, LINE_KIND, type LineInput } from "../../application/milestone";
import type { Milestone } from "../../application/milestone";
import { MilestoneRepository } from "../../ports/milestone.repository";

const wallet = (name: string) => `https://ilp.interledger-test.dev/${name}`;

// Amounts are COP minor units (scale 2): 450_000_000 is COP 4.500.000.
const seed = (id: string, title: string, producer: number, supplier: number, workers: number, fee: number): Milestone =>
  createMilestone({
    id,
    title,
    amount: producer + supplier + workers + fee,
    lines: [
      { id: `${id}-productor`, kind: LINE_KIND.PRODUCTOR, beneficiary: "Productor", walletAddress: wallet("productor"), amount: producer },
      { id: `${id}-proveedor`, kind: LINE_KIND.PROVEEDOR, beneficiary: "Proveedor de insumos", walletAddress: wallet("proveedor"), amount: supplier },
      { id: `${id}-trabajadores`, kind: LINE_KIND.TRABAJADORES, beneficiary: "Trabajadores", walletAddress: wallet("trabajadores"), amount: workers },
      { id: `${id}-plataforma`, kind: LINE_KIND.PLATAFORMA, beneficiary: "Plataforma Surco", walletAddress: wallet("plataforma"), amount: fee },
    ] satisfies LineInput[],
  });

// ponytail: in-memory demo data, resets on restart; swap for a DB adapter in milestones.module.ts
@Injectable()
export class InMemoryMilestoneAdapter extends MilestoneRepository {
  private readonly milestones = new Map(
    [
      seed("preparacion-suelo", "Preparación del suelo", 225_000_000, 135_000_000, 80_000_000, 10_000_000),
      seed("siembra", "Siembra", 300_000_000, 180_000_000, 100_000_000, 20_000_000),
      seed("primera-fertilizacion", "Primera fertilización", 160_000_000, 96_000_000, 54_000_000, 10_000_000),
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
