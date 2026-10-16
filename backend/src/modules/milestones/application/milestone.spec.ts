import {
  confirmPayment,
  distribute,
  type Milestone,
  orderPayment,
  review,
  submitEvidence,
} from "./milestone";
import { DomainError } from "../../../shared/domain-errors";

const now = new Date("2026-10-16T12:00:00Z");

const draft: Milestone = {
  id: "m1",
  title: "Siembra",
  amount: 1_000_001,
  currency: "COP",
  status: "draft",
  evidence: null,
  review: null,
  payment: null,
};

const submitted = () => submitEvidence(draft, "Foto del lote sembrado", now);
const approved = () => review(submitted(), "approved", null, now);

describe("distribute", () => {
  it("splits 50/30/20 between producer, supplier and workers", () => {
    expect(distribute(1_000_000)).toEqual([
      { recipient: "productor", percent: 50, amount: 500_000 },
      { recipient: "proveedor", percent: 30, amount: 300_000 },
      { recipient: "trabajadores", percent: 20, amount: 200_000 },
    ]);
  });

  it("never loses a peso: the rounding remainder goes to the producer", () => {
    const shares = distribute(1_000_001);
    expect(shares.reduce((sum, s) => sum + s.amount, 0)).toBe(1_000_001);
    expect(shares[0].amount).toBe(500_001);
  });
});

describe("milestone lifecycle", () => {
  it("producer submits evidence for verification", () => {
    const m = submitted();
    expect(m.status).toBe("evidence_submitted");
    expect(m.evidence).toEqual({ description: "Foto del lote sembrado", submittedAt: now });
  });

  it("rejects empty evidence", () => {
    expect(() => submitEvidence(draft, "   ", now)).toThrow(DomainError);
  });

  it("verifier approves submitted evidence without ordering any payment", () => {
    const m = approved();
    expect(m.status).toBe("approved");
    expect(m.payment).toBeNull();
  });

  it("rejection requires a reason and lets the producer resubmit", () => {
    expect(() => review(submitted(), "rejected", null, now)).toThrow(DomainError);

    const rejected = review(submitted(), "rejected", "La foto no muestra el lote", now);
    expect(rejected.status).toBe("rejected");
    expect(submitEvidence(rejected, "Nueva foto", now).status).toBe("evidence_submitted");
  });

  it("cannot review a milestone without evidence", () => {
    expect(() => review(draft, "approved", null, now)).toThrow(DomainError);
  });

  it("custodian orders a payment only for approved milestones, starting as processing", () => {
    expect(() => orderPayment(submitted(), "SIM-1", now)).toThrow(DomainError);

    const m = orderPayment(approved(), "SIM-1", now);
    expect(m.payment).toMatchObject({ status: "processing", reference: "SIM-1", confirmedAt: null });
    expect(m.payment?.shares).toEqual(distribute(draft.amount));
  });

  it("cannot order the same payment twice", () => {
    const m = orderPayment(approved(), "SIM-1", now);
    expect(() => orderPayment(m, "SIM-2", now)).toThrow(DomainError);
  });

  it("confirms a processing payment exactly once", () => {
    expect(() => confirmPayment(approved(), now)).toThrow(DomainError);

    const m = confirmPayment(orderPayment(approved(), "SIM-1", now), now);
    expect(m.payment).toMatchObject({ status: "confirmed", confirmedAt: now });
    expect(() => confirmPayment(m, now)).toThrow(DomainError);
  });
});
