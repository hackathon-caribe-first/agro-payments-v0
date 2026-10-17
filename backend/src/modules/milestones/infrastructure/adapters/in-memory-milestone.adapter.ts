import { createMilestone, LINE_KIND, type LineInput } from "../../application/milestone";
import type { Milestone } from "../../application/milestone";
import { MilestoneRepository } from "../../ports/milestone.repository";
import type { OpenPaymentsEnv } from "../../../../shared/config/env";

/** Real testnet wallet and asset; without it the seed uses COP on placeholder wallets for the simulated gateway. */
export type TestnetSeed = Pick<OpenPaymentsEnv, "receiverWalletAddress" | "assetCode" | "assetScale">;

const placeholder = (name: string) => `https://ilp.interledger-test.dev/${name}`;

const seed = (wallet: (name: string) => string, currency: string, assetScale: number) =>
  (id: string, title: string, producer: number, supplier: number, workers: number, fee: number): Milestone =>
    createMilestone({
      id,
      title,
      amount: producer + supplier + workers + fee,
      currency,
      assetScale,
      lines: [
        { id: `${id}-productor`, kind: LINE_KIND.PRODUCTOR, beneficiary: "Productor", walletAddress: wallet("productor"), amount: producer },
        { id: `${id}-proveedor`, kind: LINE_KIND.PROVEEDOR, beneficiary: "Proveedor de insumos", walletAddress: wallet("proveedor"), amount: supplier },
        { id: `${id}-trabajadores`, kind: LINE_KIND.TRABAJADORES, beneficiary: "Trabajadores", walletAddress: wallet("trabajadores"), amount: workers },
        { id: `${id}-plataforma`, kind: LINE_KIND.PLATAFORMA, beneficiary: "Plataforma Surco", walletAddress: wallet("plataforma"), amount: fee },
      ] satisfies LineInput[],
    });

function demoMilestones(testnet: TestnetSeed | null): Milestone[] {
  if (!testnet) {
    // Amounts are COP minor units (scale 2): 450_000_000 is COP 4.500.000.
    const cop = seed(placeholder, "COP", 2);
    return [
      cop("preparacion-suelo", "Preparación del suelo", 225_000_000, 135_000_000, 80_000_000, 10_000_000),
      cop("siembra", "Siembra", 300_000_000, 180_000_000, 100_000_000, 20_000_000),
      cop("primera-fertilizacion", "Primera fertilización", 160_000_000, 96_000_000, 54_000_000, 10_000_000),
    ];
  }
  // Testnet-sized totals (100, 150 and 80 in the wallet asset) split 50/30/15/5.
  // ponytail: one receiver wallet for all lines, per-beneficiary wallets when real onboarding exists.
  const units = (major: number) => major * 10 ** testnet.assetScale;
  const real = seed(() => testnet.receiverWalletAddress, testnet.assetCode, testnet.assetScale);
  return [
    real("preparacion-suelo", "Preparación del suelo", units(50), units(30), units(15), units(5)),
    real("siembra", "Siembra", units(75), units(45), units(22.5), units(7.5)),
    real("primera-fertilizacion", "Primera fertilización", units(40), units(24), units(12), units(4)),
  ];
}

// ponytail: in-memory demo data, resets on restart; swap for a DB adapter in milestones.module.ts
export class InMemoryMilestoneAdapter extends MilestoneRepository {
  private readonly milestones: Map<string, Milestone>;

  constructor(testnet: TestnetSeed | null = null) {
    super();
    this.milestones = new Map(demoMilestones(testnet).map((m) => [m.id, m]));
  }

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
