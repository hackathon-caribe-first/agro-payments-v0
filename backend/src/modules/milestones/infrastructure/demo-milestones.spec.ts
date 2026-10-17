import { demoMilestones } from "./demo-milestones";

describe("demoMilestones seed", () => {
  it("seeds unfunded COP milestones on placeholder wallets for the simulated gateway", () => {
    const milestones = demoMilestones();
    expect(milestones).toHaveLength(3);
    expect(milestones.every((m) => m.currency === "COP" && m.assetScale === 2 && m.fundedAt === null)).toBe(true);
  });

  it("seeds testnet-sized milestones paying the one receiver wallet in the testnet asset", () => {
    const receiver = "https://ilp.interledger-test.dev/surco-receiver";
    const milestones = demoMilestones({ receiverWalletAddress: receiver, assetCode: "USD", assetScale: 2 });

    expect(milestones.map((m) => m.amount)).toEqual([10_000, 15_000, 8_000]);
    for (const m of milestones) {
      expect(m).toMatchObject({ currency: "USD", assetScale: 2, fundedAt: null });
      expect(m.lines.every((l) => l.walletAddress === receiver)).toBe(true);
      expect(m.lines.filter((l) => l.kind === "productor")).toHaveLength(1);
    }
  });
});
