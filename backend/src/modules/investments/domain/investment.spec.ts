import { PROJECT_STATUS, type ProjectStatus } from "../../projects/application/project";
import {
  canInvest,
  captureSummary,
  exceedsGrant,
  impliedRate,
  INVESTMENT_STATUS,
  type Investment,
  mustRequote,
  NON_QUALIFIED_CAP_PCT,
  projectStatusAfterCapture,
  RESERVATION_TTL_MS,
  simulatedQuote,
  withQuote,
} from "./investment";

const now = new Date("2026-10-17T12:00:00Z");
const project: { currentStatus: ProjectStatus; targetAmount: number } = { currentStatus: PROJECT_STATUS.DRAFT, targetAmount: 100_000_000 }; // 1.000.000,00 COP

const investment = (overrides: Partial<Investment> = {}): Investment => ({
  id: "inv-1",
  projectId: "p1",
  investorUserId: "u-inv",
  walletAddress: "https://ilp.test/inversionista_eur",
  status: INVESTMENT_STATUS.CAPTURED,
  failureReason: null,
  amount: 5_000_000,
  currency: "COP",
  assetScale: 2,
  quote: null,
  impliedRate: null,
  incomingPaymentId: null,
  outgoingPaymentId: null,
  createdAt: now,
  capturedAt: now,
  ...overrides,
});

describe("NON_QUALIFIED_CAP_PCT", () => {
  it("is the PRD v3 per-investor cap for non-qualified investors (10 % of the project, D-01)", () => {
    expect(NON_QUALIFIED_CAP_PCT).toBe(10);
  });
});

describe("canInvest", () => {
  const ask = (amount: number, investments: Investment[] = [], overrides: Partial<typeof project> = {}, capPct = 100) =>
    canInvest({ project: { ...project, ...overrides }, investments, investorUserId: "u-inv", amount, now, capPct });

  it("accepts while the project is DRAFT, CONTRACT_SIGNED or FUNDING_IN_PROGRESS", () => {
    for (const currentStatus of [PROJECT_STATUS.DRAFT, PROJECT_STATUS.CONTRACT_SIGNED, PROJECT_STATUS.FUNDING_IN_PROGRESS]) {
      expect(ask(1_000_000, [], { currentStatus })).toBeNull();
    }
    for (const currentStatus of [PROJECT_STATUS.FUNDED_IN_CUSTODY, PROJECT_STATUS.IN_EXECUTION, PROJECT_STATUS.CANCELLED_OR_DISPUTED]) {
      expect(ask(1_000_000, [], { currentStatus })).toBe("project_status");
    }
  });

  it("refuses a non-positive amount", () => {
    expect(ask(0)).toBe("amount");
    expect(ask(-100)).toBe("amount");
  });

  it("refuses more than target − raised − live reservations; stale reservations and failures free their amount", () => {
    const others = [
      investment({ investorUserId: "a", amount: 60_000_000 }),
      investment({ investorUserId: "b", amount: 30_000_000, status: INVESTMENT_STATUS.PENDING_CONSENT, capturedAt: null }),
      investment({ investorUserId: "c", amount: 9_000_000, status: INVESTMENT_STATUS.FAILED, capturedAt: null }),
      investment({ investorUserId: "d", amount: 9_000_000, status: INVESTMENT_STATUS.PENDING_CONSENT, capturedAt: null, createdAt: new Date(now.getTime() - RESERVATION_TTL_MS) }),
    ];
    expect(ask(10_000_000, others)).toBeNull();
    expect(ask(10_000_100, others)).toBe("exceeds_remaining");
  });

  it("refuses a second consent in flight for the same investor and project", () => {
    const pending = investment({ status: INVESTMENT_STATUS.PENDING_CONSENT, capturedAt: null });
    expect(ask(1_000_000, [pending])).toBe("in_flight");
    expect(ask(1_000_000, [{ ...pending, createdAt: new Date(now.getTime() - RESERVATION_TTL_MS) }])).toBeNull();
  });

  it("caps what one investor holds in the project at capPct of the target (default 10 %)", () => {
    const mine = investment({ amount: 6_000_000 });
    expect(canInvest({ project, investments: [mine], investorUserId: "u-inv", amount: 4_000_000, now })).toBeNull();
    expect(canInvest({ project, investments: [mine], investorUserId: "u-inv", amount: 4_000_100, now })).toBe("investor_cap");
    expect(canInvest({ project, investments: [mine], investorUserId: "someone-else", amount: 10_000_000, now })).toBeNull();
  });
});

describe("projectStatusAfterCapture", () => {
  it("moves a pre-custody project to FUNDING_IN_PROGRESS, and to FUNDED_IN_CUSTODY once custody reaches the target", () => {
    expect(projectStatusAfterCapture(PROJECT_STATUS.DRAFT, 1, 100)).toBe(PROJECT_STATUS.FUNDING_IN_PROGRESS);
    expect(projectStatusAfterCapture(PROJECT_STATUS.CONTRACT_SIGNED, 99, 100)).toBe(PROJECT_STATUS.FUNDING_IN_PROGRESS);
    expect(projectStatusAfterCapture(PROJECT_STATUS.FUNDING_IN_PROGRESS, 100, 100)).toBe(PROJECT_STATUS.FUNDED_IN_CUSTODY);
  });

  it("never regresses a project already funded or beyond", () => {
    expect(projectStatusAfterCapture(PROJECT_STATUS.FUNDED_IN_CUSTODY, 1, 100)).toBe(PROJECT_STATUS.FUNDED_IN_CUSTODY);
    expect(projectStatusAfterCapture(PROJECT_STATUS.IN_EXECUTION, 1, 100)).toBe(PROJECT_STATUS.IN_EXECUTION);
  });
});

describe("impliedRate (TRM_0, RNF-10)", () => {
  it("is COP per unit of the investor's currency as an exact reduced ratio", () => {
    // 100.000,00 COP received for 22,50 EUR debited: 100000 / 22.5 = 40000/9.
    expect(impliedRate({ value: 10_000_000, assetScale: 2 }, { value: 2_250, assetScale: 2 })).toBe("40000/9");
    expect(impliedRate({ value: 500, assetScale: 2 }, { value: 500, assetScale: 2 })).toBe("1/1");
    // Different scales: 1,00 COP for 0.001 XYZ (scale 3) = 1000/1.
    expect(impliedRate({ value: 100, assetScale: 2 }, { value: 1, assetScale: 3 })).toBe("1000/1");
  });

  it("refuses a zero debit", () => {
    expect(() => impliedRate({ value: 100, assetScale: 2 }, { value: 0, assetScale: 2 })).toThrow();
  });
});

describe("withQuote", () => {
  it("records the quote and its implied rate on the investment", () => {
    const quote = { id: "q-1", debitAmount: 2_250, debitAssetCode: "EUR", debitAssetScale: 2, receiveAmount: 10_000_000, expiresAt: "2026-10-17T12:05:00.000Z" };
    expect(withQuote(investment({ amount: 10_000_000 }), quote)).toMatchObject({ quote, impliedRate: "40000/9" });
  });
});

describe("simulatedQuote", () => {
  it("debits the same amount for a COP wallet and rounds a foreign debit up at the fixed simulated rate", () => {
    expect(simulatedQuote("inv-1", 10_000_000, 2, { assetCode: "COP", assetScale: 2 }, now)).toMatchObject({ debitAmount: 10_000_000, debitAssetCode: "COP", receiveAmount: 10_000_000 });
    // 100.000 COP at 4.400 COP/EUR = 22,7272… EUR → 22,73.
    expect(simulatedQuote("inv-1", 10_000_000, 2, { assetCode: "EUR", assetScale: 2 }, now)).toMatchObject({ debitAmount: 2_273, debitAssetCode: "EUR" });
    // 100.000 COP at 4.000 COP/USD = 25,00 USD exactly.
    expect(simulatedQuote("inv-1", 10_000_000, 2, { assetCode: "USD", assetScale: 2 }, now)).toMatchObject({ debitAmount: 2_500, debitAssetCode: "USD" });
  });

  it("refuses a currency the simulated table does not know", () => {
    expect(() => simulatedQuote("inv-1", 100, 2, { assetCode: "JPY", assetScale: 0 }, now)).toThrow(/JPY/);
  });
});

describe("re-quote decision (RNF-13)", () => {
  it("re-quotes a quote that expired or expires within the safety margin; a quote without expiry is kept", () => {
    expect(mustRequote("2026-10-17T11:59:59.000Z", now)).toBe(true);
    expect(mustRequote("2026-10-17T12:00:05.000Z", now)).toBe(true);
    expect(mustRequote("2026-10-17T12:05:00.000Z", now)).toBe(false);
    expect(mustRequote(null, now)).toBe(false);
  });

  it("refuses a new debit above what the investor approved", () => {
    expect(exceedsGrant(2_250, 2_250)).toBe(false);
    expect(exceedsGrant(2_251, 2_250)).toBe(true);
  });
});

describe("captureSummary", () => {
  it("adds up captured investments only, by the investor's currency, with an integer progress", () => {
    const eur = { id: "q", debitAssetCode: "EUR", debitAssetScale: 2, expiresAt: null };
    const summary = captureSummary(project, [
      investment({ investorUserId: "a", amount: 10_000_000, quote: { ...eur, debitAmount: 2_250, receiveAmount: 10_000_000 } }),
      investment({ investorUserId: "a", amount: 5_000_000, quote: { ...eur, debitAmount: 1_130, receiveAmount: 5_000_000 } }),
      investment({ investorUserId: "b", amount: 18_333_333, quote: { ...eur, debitAssetCode: "COP", debitAmount: 18_333_333, receiveAmount: 18_333_333 } }),
      investment({ investorUserId: "c", amount: 40_000_000, status: INVESTMENT_STATUS.PENDING_CONSENT }),
    ]);
    expect(summary).toEqual({
      target: 100_000_000,
      raised: 33_333_333,
      progressPct: 33,
      investorsCount: 2,
      byCurrency: [
        { currency: "EUR", debited: "3380", received: 15_000_000 },
        { currency: "COP", debited: "18333333", received: 18_333_333 },
      ],
    });
  });

  it("is 0 % for a project without target", () => {
    expect(captureSummary({ targetAmount: 0 }, []).progressPct).toBe(0);
  });
});
