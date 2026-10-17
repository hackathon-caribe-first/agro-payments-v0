import { addEvidenceLog } from "./milestone-progress";
import { applyLineResult, createMilestone, LINE_KIND, type Milestone, review, submitEvidence } from "./milestone";
import { milestoneEvents } from "./milestone-events";
import { sampleMilestone } from "./testing";

const now = new Date("2026-10-17T10:00:00Z");
const inProject = (m: Milestone): Milestone => ({ ...m, projectId: "p-1" });

describe("milestoneEvents (RF-37, RF-35)", () => {
  it("reports a line that just settled as paid, once", () => {
    const before = inProject(sampleMilestone());
    const queued = applyLineResult(before, "l-prod", { status: "en_cola", reference: "R" }, now);
    const paid = applyLineResult(queued, "l-prod", { status: "completado", reference: "R" }, now);
    expect(milestoneEvents(before, queued)).toEqual([]);
    expect(milestoneEvents(queued, paid)).toEqual([
      {
        type: "line.paid",
        projectId: "p-1",
        milestoneId: "m1",
        milestoneTitle: "Siembra",
        lineId: "l-prod",
        kind: "productor",
        beneficiary: "Productor",
        amount: 600_000,
        currency: "COP",
        assetScale: 2,
      },
    ]);
    expect(milestoneEvents(paid, paid)).toEqual([]);
  });

  it("reports the verdicts with the verifier's reason", () => {
    const submitted = submitEvidence(inProject(sampleMilestone()), "Foto", now);
    const observed = review(submitted, "observado", "La foto no muestra el lote", now);
    expect(milestoneEvents(submitted, observed)).toEqual([
      { type: "milestone.observed", projectId: "p-1", milestoneId: "m1", milestoneTitle: "Siembra", reason: "La foto no muestra el lote" },
    ]);
    const approved = review(submitEvidence(observed, "Otra foto", now), "approved", null, now);
    expect(milestoneEvents(observed, approved).map((e) => e.type)).toEqual(["milestone.approved"]);
  });

  it("reports new evidence logs and the submission to the verifier, with photos and location", () => {
    const m = inProject(
      createMilestone({
        id: "m1",
        title: "Siembra",
        amount: 100,
        lines: [{ id: "l", kind: LINE_KIND.PLATAFORMA, beneficiary: "P", walletAddress: "https://w.test/p", amount: 100 }],
        requirements: [{ fieldKey: "fotos", label: "Fotos", type: "photo_array", minItems: 1 }],
      }),
    );
    const funded = { ...m, fundedAt: now };
    const logged = addEvidenceLog(
      funded,
      [funded],
      {
        logType: "PHOTO_EVIDENCE",
        notes: "ya sembré",
        evidencePayload: { fotos: ["https://img.test/1.jpg"] },
        attestation: { location: { latitude: 4.6, longitude: -74.1 }, photoHashes: [{ url: "https://img.test/1.jpg", sha256: "a".repeat(64) }] },
      },
      now,
    );
    expect(milestoneEvents(funded, logged)).toEqual([
      { type: "evidence.recorded", projectId: "p-1", milestoneId: "m1", milestoneTitle: "Siembra", stage: "log", photoCount: 1, location: { latitude: 4.6, longitude: -74.1 } },
    ]);
    const submitted = submitEvidence(logged, "ya sembré", now);
    expect(milestoneEvents(logged, submitted)).toEqual([
      { type: "evidence.recorded", projectId: "p-1", milestoneId: "m1", milestoneTitle: "Siembra", stage: "submitted", photoCount: 1, location: { latitude: 4.6, longitude: -74.1 } },
    ]);
  });
});
