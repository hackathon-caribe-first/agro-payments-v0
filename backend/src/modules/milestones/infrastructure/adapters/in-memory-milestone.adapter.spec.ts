import { InMemoryMilestoneAdapter } from "./in-memory-milestone.adapter";

describe("InMemoryMilestoneAdapter seed", () => {
  it("seeds unfunded COP milestones on placeholder wallets for the simulated gateway", async () => {
    const milestones = await new InMemoryMilestoneAdapter().findAll();
    expect(milestones).toHaveLength(3);
    expect(milestones.every((m) => m.currency === "COP" && m.assetScale === 2 && m.fundedAt === null)).toBe(true);
  });

  it("seeds testnet-sized milestones paying the one receiver wallet in the testnet asset", async () => {
    const receiver = "https://ilp.interledger-test.dev/surco-receiver";
    const milestones = await new InMemoryMilestoneAdapter({ receiverWalletAddress: receiver, assetCode: "USD", assetScale: 2 }).findAll();

    expect(milestones.map((m) => m.amount)).toEqual([10_000, 15_000, 8_000]);
    for (const m of milestones) {
      expect(m).toMatchObject({ currency: "USD", assetScale: 2, fundedAt: null });
      expect(m.lines.every((l) => l.walletAddress === receiver)).toBe(true);
      expect(m.lines.filter((l) => l.kind === "productor")).toHaveLength(1);
    }
  });
});
