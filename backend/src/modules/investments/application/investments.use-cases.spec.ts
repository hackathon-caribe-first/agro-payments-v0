import { DomainError, NotFoundError, RejectedError, ValidationError } from "../../../shared/domain-errors";
import { PROJECT_STATUS } from "../../projects/application/project";
import { INVESTMENT_STATUS } from "../domain/investment";
import { InvestmentUseCases } from "./investments.use-cases";
import {
  BUYER,
  EUR_WALLET,
  eurQuote,
  FakeCapture,
  FIDU,
  InMemoryInvestmentStore,
  INVESTOR,
  NOW,
  OTHER_INVESTOR,
  OTHER_SELLER,
  OWNER,
  sampleProject,
} from "./testing";

function setup(projectOverrides = {}) {
  const store = new InMemoryInvestmentStore();
  store.projects.set("p1", sampleProject(projectOverrides));
  const capture = new FakeCapture();
  let now = NOW;
  const clock = { now: () => now };
  return {
    store,
    capture,
    useCases: new InvestmentUseCases(store, capture, clock),
    later: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

const order = (amount = 10_000_000, walletAddress = EUR_WALLET.id) => ({ amount, walletAddress });

describe("InvestmentUseCases.invest — simulated (the money moves at once)", () => {
  it("captures: records the quote and rate, books the INVESTOR_CAPITAL credit in pesos and fills the project's custody", async () => {
    const { store, useCases } = setup();
    const done = await useCases.invest("p1", INVESTOR, order());
    expect(done).toMatchObject({
      status: INVESTMENT_STATUS.CAPTURED,
      investorUserId: INVESTOR.id,
      amount: 10_000_000,
      quote: eurQuote(),
      impliedRate: "40000/9",
      outgoingPaymentId: `SIM-${done.id}`,
      capturedAt: NOW,
    });
    expect(done.consentRedirectUrl).toBeUndefined();
    expect(store.ledger).toEqual([
      { id: expect.any(String), projectId: "p1", investmentId: done.id, amount: 100_000, currency: "COP", paymentReference: `SIM-${done.id}`, createdAt: NOW.toISOString() },
    ]);
    expect(store.projects.get("p1")).toMatchObject({ custodyBalance: 10_000_000, currentStatus: PROJECT_STATUS.FUNDING_IN_PROGRESS });
  });

  it("moves the project to FUNDED_IN_CUSTODY when custody reaches the target", async () => {
    // Custody already holds 90.000 pesos; this investor's 10 % completes the target.
    const { store, useCases } = setup({ targetAmount: 10_000_000, custodyBalance: 9_000_000, currentStatus: PROJECT_STATUS.FUNDING_IN_PROGRESS });
    await useCases.invest("p1", INVESTOR, order(1_000_000));
    expect(store.projects.get("p1")).toMatchObject({ custodyBalance: 10_000_000, currentStatus: PROJECT_STATUS.FUNDED_IN_CUSTODY });
  });
});

describe("InvestmentUseCases.invest — Open Payments (the investor approves in their wallet)", () => {
  it("reserves the amount and answers PENDING_CONSENT with the consent URL, the quote and the incoming payment; nothing is booked", async () => {
    const { store, capture, useCases } = setup();
    capture.mode = "consent";
    const pending = await useCases.invest("p1", INVESTOR, order());
    expect(pending).toMatchObject({
      status: INVESTMENT_STATUS.PENDING_CONSENT,
      consentRedirectUrl: "https://wallet.test/consent",
      quote: eurQuote(),
      impliedRate: "40000/9",
      incomingPaymentId: "https://rs.custody.test/incoming-payments/in-1",
      outgoingPaymentId: null,
      capturedAt: null,
    });
    expect(await store.findById(pending.id)).not.toHaveProperty("consentRedirectUrl");
    expect(store.ledger).toEqual([]);
    expect(store.projects.get("p1")?.custodyBalance).toBe(0);
  });

  it("the wallet callback captures it once; a replay is refused and books nothing", async () => {
    const { store, capture, useCases } = setup();
    capture.mode = "consent";
    const pending = await useCases.invest("p1", INVESTOR, order());
    const done = await useCases.completeConsent(pending.id, { interactRef: "ref", hash: "h" });
    expect(done).toMatchObject({ status: INVESTMENT_STATUS.CAPTURED, outgoingPaymentId: "https://rs.inv.test/outgoing-payments/out-1", capturedAt: NOW });
    expect(capture.completed).toEqual([{ id: pending.id, callback: { interactRef: "ref", hash: "h" } }]);
    await expect(useCases.completeConsent(pending.id, { interactRef: "ref", hash: "h" })).rejects.toThrow(RejectedError);
    expect(store.ledger).toHaveLength(1);
    expect(store.projects.get("p1")?.custodyBalance).toBe(10_000_000);
  });

  it("records the re-quote and the reason when the capture fails after consent (RNF-13)", async () => {
    const { store, capture, useCases } = setup();
    capture.mode = "consent";
    const pending = await useCases.invest("p1", INVESTOR, order());
    const requote = eurQuote({ id: "q-2", debitAmount: 2_300 });
    capture.completion = { kind: "failed", quote: requote, reason: "La nueva cotización supera lo aprobado" };
    const failed = await useCases.completeConsent(pending.id, { interactRef: "ref", hash: "h" });
    expect(failed).toMatchObject({ status: INVESTMENT_STATUS.FAILED, failureReason: "La nueva cotización supera lo aprobado", quote: requote, impliedRate: "100000/23" });
    expect(store.ledger).toEqual([]);
  });

  it("a callback the capture cannot trust changes nothing", async () => {
    const { store, capture, useCases } = setup();
    capture.mode = "consent";
    const pending = await useCases.invest("p1", INVESTOR, order());
    capture.completionError = new DomainError("hash mismatch");
    await expect(useCases.completeConsent(pending.id, { interactRef: "ref", hash: "bad" })).rejects.toThrow("hash mismatch");
    expect((await store.findById(pending.id))?.status).toBe(INVESTMENT_STATUS.PENDING_CONSENT);
  });

  it("an unknown investment is a 404", async () => {
    await expect(setup().useCases.completeConsent("nope", { interactRef: "r", hash: "h" })).rejects.toThrow(NotFoundError);
  });

  it("a start that fails marks the investment FAILED and frees its reservation", async () => {
    const { store, capture, useCases } = setup();
    capture.startError = new Error("wallet down");
    await expect(useCases.invest("p1", INVESTOR, order())).rejects.toThrow(RejectedError);
    expect([...store.investments.values()]).toEqual([expect.objectContaining({ status: INVESTMENT_STATUS.FAILED, failureReason: "wallet down" })]);
    capture.startError = null;
    await expect(useCases.invest("p1", INVESTOR, order())).resolves.toMatchObject({ status: INVESTMENT_STATUS.CAPTURED });
  });
});

describe("InvestmentUseCases.invest — refusals", () => {
  it("only an investor invests", async () => {
    await expect(setup().useCases.invest("p1", FIDU, order())).rejects.toThrow(RejectedError);
  });

  it("a project the caller cannot see is a 404", async () => {
    await expect(setup().useCases.invest("nope", INVESTOR, order())).rejects.toThrow(NotFoundError);
  });

  it("a wallet address that cannot be read is a 400 on wallet_address", async () => {
    const error = await setup()
      .useCases.invest("p1", INVESTOR, order(10_000_000, "https://ilp.test/unknown"))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toEqual({ wallet_address: [expect.any(String)] });
  });

  it("refuses a funded project, the investor cap, a second consent in flight and more than what remains, with a message", async () => {
    await expect(setup({ currentStatus: PROJECT_STATUS.FUNDED_IN_CUSTODY }).useCases.invest("p1", INVESTOR, order())).rejects.toThrow(/no recibe inversiones/);
    await expect(setup().useCases.invest("p1", INVESTOR, order(10_000_100))).rejects.toThrow(/10 %/);

    const { capture, useCases } = setup();
    capture.mode = "consent";
    await useCases.invest("p1", INVESTOR, order(1_000_000));
    await expect(useCases.invest("p1", INVESTOR, order(1_000_000))).rejects.toThrow(/aprobación pendiente/);

    const small = setup({ targetAmount: 5_000_000 });
    await expect(small.useCases.invest("p1", INVESTOR, order(5_000_100))).rejects.toThrow(/supera lo que falta/);
  });
});

describe("InvestmentUseCases reads", () => {
  async function seeded() {
    const s = setup();
    await s.useCases.invest("p1", INVESTOR, order(10_000_000));
    await s.useCases.invest("p1", OTHER_INVESTOR, order(5_000_000));
    return s;
  }

  it("an investor lists their own investments; the owner producer and staff list all; anyone else gets 404", async () => {
    const { useCases } = await seeded();
    expect((await useCases.listForProject("p1", INVESTOR)).map((i) => i.investorUserId)).toEqual([INVESTOR.id]);
    expect(await useCases.listForProject("p1", OWNER)).toHaveLength(2);
    expect(await useCases.listForProject("p1", FIDU)).toHaveLength(2);
    await expect(useCases.listForProject("p1", OTHER_SELLER)).rejects.toThrow(NotFoundError);
    await expect(useCases.listForProject("p1", BUYER)).rejects.toThrow(NotFoundError);
  });

  it("one investment: its investor, the owner and staff; another investor gets 404", async () => {
    const { useCases, store } = await seeded();
    const mine = [...store.investments.values()].find((i) => i.investorUserId === INVESTOR.id)!;
    expect((await useCases.get(mine.id, INVESTOR)).id).toBe(mine.id);
    expect((await useCases.get(mine.id, OWNER)).id).toBe(mine.id);
    await expect(useCases.get(mine.id, OTHER_INVESTOR)).rejects.toThrow(NotFoundError);
    await expect(useCases.get("nope", FIDU)).rejects.toThrow(NotFoundError);
  });

  it("the capture bar of a project", async () => {
    const { useCases } = await seeded();
    expect(await useCases.capture("p1", INVESTOR)).toMatchObject({ target: 100_000_000, raised: 15_000_000, progressPct: 15, investorsCount: 2 });
  });

  it("the fundable projects with their capture bar, for the investor catalog", async () => {
    const { store, useCases } = await seeded();
    store.projects.set("p2", sampleProject({ id: "p2", currentStatus: PROJECT_STATUS.IN_EXECUTION }));
    expect((await useCases.fundable(INVESTOR)).map((e) => [e.project.id, e.summary.raised])).toEqual([["p1", 15_000_000]]);
  });

  it("one project with its capture bar, whatever its status, for the investor's project page", async () => {
    const { store, useCases } = await seeded();
    store.projects.set("p1", { ...store.projects.get("p1")!, currentStatus: PROJECT_STATUS.FUNDED_IN_CUSTODY });
    expect(await useCases.projectWithCapture("p1", INVESTOR)).toMatchObject({ project: { id: "p1" }, summary: { raised: 15_000_000 } });
    await expect(useCases.projectWithCapture("p1", BUYER)).rejects.toThrow(NotFoundError);
  });

  it("the captured positions the settlement cascade pays: COP capital, the wallet's currency and address", async () => {
    const { useCases, capture } = await seeded();
    capture.mode = "consent";
    await useCases.invest("p1", { ...INVESTOR, id: "u-pending" }, order(1_000_000));
    const positions = await useCases.capturedPositions("p1");
    expect(positions).toEqual([
      { id: expect.any(String), capital: 10_000_000, currency: "EUR", walletAddress: EUR_WALLET.id },
      { id: expect.any(String), capital: 5_000_000, currency: "EUR", walletAddress: EUR_WALLET.id },
    ]);
  });
});
