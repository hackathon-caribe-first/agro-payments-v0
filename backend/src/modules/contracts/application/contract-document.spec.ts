import { createHash } from "node:crypto";
import { RejectedError } from "../../../shared/domain-errors";
import { buildContractDocument, fullySigned, PARTY_ROLE, signContract, signableParties } from "./contract-document";
import { contractContext, FIDU, INVESTOR_A, INVESTOR_B, OWNER, BUYER_USER } from "./testing";

const now = new Date("2026-10-17T12:00:00Z");
const meta = { ip: "10.0.0.1", userAgent: "vitest" };

describe("contract document (RF-09)", () => {
  it("renders the template with project, milestones and caps, cascade, purchase contract, policy and every party", () => {
    const doc = buildContractDocument({ id: "c1", version: 1, context: contractContext(), createdBy: OWNER.id, now });
    for (const text of [
      "AGR-2026-001",
      "Tomate bajo invernadero",
      "Hito 1 · Siembra · tope $ 3.090.000",
      "deuda del integrador, capital a prorrata, retorno preferente, aporte del productor y excedente (50 % inversionistas, 30 % productor, 20 % Plataforma)",
      "Precio fijo: $ 1.300 por kg",
      "Cantidad: 85.000 kg",
      "Prima neta: $ 640.458",
      "Beneficiario: patrimonio autónomo",
      "Ana Inversionista · capital $ 30.000",
      "Comprador: Comercializadora Andina",
      "Productor: Pedro Productor",
      "Patrimonio autónomo: la fiduciaria",
    ]) {
      expect(doc.body).toContain(text);
    }
    expect(doc.hash).toBe(createHash("sha256").update(doc.body).digest("hex"));
    expect(doc.parties.map((p) => p.role)).toEqual(["investor", "investor", "fiduciaria", "producer", "buyer"]);
    expect(doc.signatures).toEqual([]);
  });

  it("is deterministic: the same terms give the same hash whatever the version", () => {
    const a = buildContractDocument({ id: "c1", version: 1, context: contractContext(), createdBy: OWNER.id, now });
    const b = buildContractDocument({ id: "c2", version: 2, context: contractContext(), createdBy: OWNER.id, now });
    expect(b.hash).toBe(a.hash);
  });

  it("lets each party sign once, recording user, role, time, ip, user agent and the hash", () => {
    let doc = buildContractDocument({ id: "c1", version: 1, context: contractContext(), createdBy: OWNER.id, now });
    expect(signableParties(doc, OWNER).map((p) => p.role)).toEqual([PARTY_ROLE.PRODUCER]);
    doc = signContract(doc, OWNER, meta, now);
    expect(doc.signatures).toEqual([{ partyRole: "producer", userId: OWNER.id, signedAt: now, ip: "10.0.0.1", userAgent: "vitest", contractHash: doc.hash }]);
    expect(() => signContract(doc, OWNER, meta, now)).toThrow(new RejectedError("Ya firmaste este contrato."));
  });

  it("any fiduciaria user signs for the patrimonio autónomo; a stranger is refused", () => {
    const doc = signContract(buildContractDocument({ id: "c1", version: 1, context: contractContext(), createdBy: OWNER.id, now }), FIDU, meta, now);
    expect(doc.signatures[0]).toMatchObject({ partyRole: "fiduciaria", userId: FIDU.id });
    expect(() => signContract(doc, { id: "u-x", role: "investor" }, meta, now)).toThrow(new RejectedError("No eres parte de este contrato."));
  });

  it("is fully signed only when every party signed", () => {
    let doc = buildContractDocument({ id: "c1", version: 1, context: contractContext(), createdBy: OWNER.id, now });
    for (const signer of [OWNER, FIDU, INVESTOR_A, INVESTOR_B]) doc = signContract(doc, signer, meta, now);
    expect(fullySigned(doc)).toBe(false);
    doc = signContract(doc, BUYER_USER, meta, now);
    expect(fullySigned(doc)).toBe(true);
  });

  it("a buyer who is also an investor signs both parties at once", () => {
    const context = contractContext();
    context.purchase.buyerUserId = INVESTOR_A.id;
    const doc = signContract(buildContractDocument({ id: "c1", version: 1, context, createdBy: OWNER.id, now }), INVESTOR_A, meta, now);
    expect(doc.signatures.map((s) => s.partyRole).sort()).toEqual(["buyer", "investor"]);
  });
});
