// RF-01 and RF-19/RF-35 wire fields: optional, snake_case, absent from responses when not set (existing contract unchanged).
import { buildProject } from "../application/project";
import { toEvidenceLogResponse, toProjectResponse } from "./api.mappers";
import { parseCreateProjectRequest, parseEvidenceLogRequest } from "./api.requests";

const square = { type: "Polygon", coordinates: [[[-74.1, 4.6], [-74.0, 4.6], [-74.0, 4.7], [-74.1, 4.7], [-74.1, 4.6]]] };
const body = (extra: Record<string, unknown> = {}) => ({
  title: "Maíz P1",
  description: "Maíz en dos hectáreas",
  production_type: "OTRO",
  start_date: "2026-11-01",
  estimated_end_date: "2027-03-30",
  milestones: [
    {
      title: "Siembra",
      description: "Siembra",
      estimated_completion_date: "2026-12-01",
      supplies_budget: 0,
      labor_budget: 300,
      sequence_order: 1,
      requirements_schema: { required_evidences: [] },
    },
  ],
  ...extra,
});

describe("POST /api/projects intake fields (RF-01)", () => {
  it("passes plot_polygon and producer_wallet_address to the domain", () => {
    expect(parseCreateProjectRequest(body({ plot_polygon: square, producer_wallet_address: "https://ilp.test/p" }))).toMatchObject({
      plotPolygon: square,
      producerWalletAddress: "https://ilp.test/p",
    });
  });

  it("leaves them out when not sent", () => {
    const parsed = parseCreateProjectRequest(body());
    expect(parsed).not.toHaveProperty("plotPolygon");
    expect(parsed).not.toHaveProperty("producerWalletAddress");
  });

  it("answers them back only when the project has them", () => {
    const plain = buildProject({ id: "p", ownerUserId: "u", now: new Date(), wallets: { producer: "https://w", supplier: "https://w", platform: "https://w" }, input: parseCreateProjectRequest(body()) });
    expect(toProjectResponse({ ...plain.project, projectCode: "AGR-2026-001" })).not.toHaveProperty("plot_polygon");
    const drawn = buildProject({
      id: "p",
      ownerUserId: "u",
      now: new Date(),
      wallets: { producer: "https://w", supplier: "https://w", platform: "https://w" },
      input: parseCreateProjectRequest(body({ plot_polygon: square, producer_wallet_address: "https://ilp.test/p" })),
    });
    expect(toProjectResponse({ ...drawn.project, projectCode: "AGR-2026-001" })).toMatchObject({ plot_polygon: square, producer_wallet_address: "https://ilp.test/p" });
  });
});

describe("evidence log location and photo hashes (RF-19/RF-35)", () => {
  it("maps location and photo_hashes into the attestation", () => {
    expect(
      parseEvidenceLogRequest({
        log_type: "PHOTO_EVIDENCE",
        notes: "ok",
        evidence_payload: { fotos: ["https://img.test/1.jpg"] },
        location: { latitude: 4.6, longitude: -74.1 },
        photo_hashes: [{ url: "https://img.test/1.jpg", sha256: "a".repeat(64) }],
      }),
    ).toEqual({
      logType: "PHOTO_EVIDENCE",
      notes: "ok",
      evidencePayload: { fotos: ["https://img.test/1.jpg"] },
      attestation: { location: { latitude: 4.6, longitude: -74.1 }, photoHashes: [{ url: "https://img.test/1.jpg", sha256: "a".repeat(64) }] },
    });
  });

  it("sends no attestation when neither field is present", () => {
    expect(parseEvidenceLogRequest({ log_type: "AGRONOMIC_NOTE", notes: "n", evidence_payload: {} })).not.toHaveProperty("attestation");
  });

  it("answers location and photo_hashes back on the log", () => {
    const log = {
      id: "l1",
      logType: "PHOTO_EVIDENCE" as const,
      notes: "ok",
      evidencePayload: { fotos: ["https://img.test/1.jpg"] },
      attestation: { location: { latitude: 4.6, longitude: -74.1 }, photoHashes: [{ url: "https://img.test/1.jpg", sha256: "a".repeat(64) }] },
      createdAt: new Date("2026-10-17T00:00:00Z"),
    };
    expect(toEvidenceLogResponse("m1", log)).toMatchObject({ location: { latitude: 4.6, longitude: -74.1 }, photo_hashes: [{ url: "https://img.test/1.jpg", sha256: "a".repeat(64) }] });
    expect(toEvidenceLogResponse("m1", { ...log, attestation: undefined })).not.toHaveProperty("location");
  });
});
