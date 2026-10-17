import { NotFoundError } from "../../../shared/domain-errors";
import { FakeRepository, unfundedMilestone } from "../../milestones/application/testing";
import { fund } from "../../milestones/application/milestone";
import { INVESTOR, OTHER_INVESTOR, FIDU, sampleProject } from "../../investments/application/testing";
import type { Investment } from "../../investments/domain/investment";
import { PROJECT_STATUS } from "../../projects/application/project";
import { applyPayoutResult, approveSettlement, startExecution } from "../../settlement/application/settlement";
import { sampleSettlement } from "../../settlement/application/testing";
import { InvestorPanelUseCases } from "./investor-panel.use-cases";
import { FakeHarvestStore, FakePanelSources, PRODUCER, VERIFIER } from "./testing";

const at = new Date("2027-03-01T12:00:00Z");
const investment = (id: string, investorUserId: string, amount: number): Investment => ({
  id,
  projectId: "p1",
  investorUserId,
  walletAddress: `https://wallet.test/${id}`,
  status: "CAPTURED",
  failureReason: null,
  amount,
  currency: "COP",
  assetScale: 2,
  quote: { id: `q-${id}`, debitAmount: amount, debitAssetCode: "COP", debitAssetScale: 2, receiveAmount: amount, expiresAt: null },
  impliedRate: "1/1",
  incomingPaymentId: null,
  outgoingPaymentId: `out-${id}`,
  createdAt: at,
  capturedAt: at,
});

function setup() {
  const project = sampleProject({ currentStatus: PROJECT_STATUS.SETTLED_AND_CLOSED, custodyBalance: 300_000_000 });
  const store = new FakeHarvestStore(project);
  const milestones = new FakeRepository(new Map([["m1", fund({ ...unfundedMilestone(), projectId: "p1", sequenceOrder: 1 }, at)]]));
  // sampleSettlement pays investors "inv-cop" (60 M) and "inv-eur" (40 M); here inv-cop is INVESTOR's.
  let settlement = startExecution(approveSettlement({ ...sampleSettlement(), projectId: "p1" }, "u-fidu", at));
  for (const p of settlement.payouts) settlement = applyPayoutResult(settlement, p.id, { status: "completado", reference: `R-${p.id}` }, at);
  const sources = new FakePanelSources([investment("inv-cop", INVESTOR.id, 60_000_000), investment("inv-eur", OTHER_INVESTOR.id, 40_000_000)], [settlement]);
  return { settlement, useCases: new InvestorPanelUseCases(store, milestones, sources) };
}

describe("InvestorPanelUseCases.panel (RF-27)", () => {
  it("shows the investor their own position: capture, custody, milestone grants, receipts and realized TIR", async () => {
    const { useCases, settlement } = setup();
    const panel = await useCases.panel("p1", INVESTOR);
    expect(panel.capture).toMatchObject({ target: 100_000_000, raised: 100_000_000, investorsCount: 2 });
    expect(panel.custody).toMatchObject({ credited: 300_000_000, settlementDebits: 200_000_000, balance: 100_000_000 });
    expect(panel.milestones).toEqual([expect.objectContaining({ grant: { status: "active", cap: 1_000_000, spent: 0, remaining: 1_000_000 } })]);
    expect(panel.myInvestments.map((i) => i.investment.id)).toEqual(["inv-cop"]);
    expect(panel.myInvestments[0].payouts).toEqual([expect.objectContaining({ id: "investor-inv-cop", status: "executed" })]);
    const x = settlement.payouts.find((p) => p.id === "investor-inv-cop")?.amount ?? 0;
    expect(panel.realized).toMatchObject({ status: "settled", capital: 60_000_000, returned: x, investorCurrency: "COP" });
    expect(panel.median).toBeNull();
  });

  it("shows the fiduciaria every investment, and hides the panel from other roles", async () => {
    const { useCases } = setup();
    expect((await useCases.panel("p1", FIDU)).myInvestments).toHaveLength(2);
    await expect(useCases.panel("p1", PRODUCER)).rejects.toThrow(NotFoundError);
    await expect(useCases.panel("nope", INVESTOR)).rejects.toThrow(NotFoundError);
  });
});

describe("InvestorPanelUseCases.custody (RF-21)", () => {
  it("is visible to the owner producer and the verifier (observed milestones), not another producer", async () => {
    const { useCases } = setup();
    expect((await useCases.custody("p1", PRODUCER)).balance).toBe(100_000_000);
    expect((await useCases.custody("p1", VERIFIER)).balance).toBe(100_000_000);
    await expect(useCases.custody("p1", { ...PRODUCER, id: "u-other" })).rejects.toThrow(NotFoundError);
  });
});
