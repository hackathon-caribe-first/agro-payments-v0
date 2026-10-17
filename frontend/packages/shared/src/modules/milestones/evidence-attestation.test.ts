import { createMockFetch } from "./infrastructure/mock/mock-fetch";
import { createFixtureStore, FIXTURE_PHOTO_URLS } from "./infrastructure/mock/fixtures";
import { createMilestonesModule } from "./infrastructure/milestones-module";
import { HttpMilestoneRepository } from "./infrastructure/http-milestone-repository";
import { errorsUnder, parseAttestationForm, toEvidenceFieldErrors } from "./schemas/evidence-log";
import { recordEvidenceLog } from "./application/use-cases";

const HASH = "a".repeat(64);
const [P1, P2, P3] = FIXTURE_PHOTO_URLS;

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("parseAttestationForm (RF-19/RF-35)", () => {
  it("reads the location and pairs each hashed photo URL with its sha256", () => {
    const parsed = parseAttestationForm(
      form([
        ["latitude", "4.711"],
        ["longitude", "-74.0721"],
        ["photoHashUrl", P1],
        ["photoHashSha256", HASH],
        ["photoHashUrl", P2],
        ["photoHashSha256", "b".repeat(64)],
      ]),
    );
    expect(parsed).toEqual({
      location: { latitude: 4.711, longitude: -74.0721 },
      photoHashes: [
        { url: P1, sha256: HASH },
        { url: P2, sha256: "b".repeat(64) },
      ],
    });
  });

  it("omits what the producer did not capture", () => {
    expect(parseAttestationForm(form([["latitude", ""], ["longitude", ""]]))).toEqual({});
  });

  it("keeps the first hash when a photo URL repeats (the backend allows one per photo)", () => {
    const parsed = parseAttestationForm(
      form([
        ["photoHashUrl", P1],
        ["photoHashSha256", HASH],
        ["photoHashUrl", P1],
        ["photoHashSha256", "c".repeat(64)],
      ]),
    );
    expect(parsed.photoHashes).toEqual([{ url: P1, sha256: HASH }]);
  });
});

describe("server field errors for an evidence log", () => {
  it("drops the backend's attestation prefix so errors land next to the location and photo fields", () => {
    expect(
      toEvidenceFieldErrors({
        "attestation.location": ["La ubicación no es válida."],
        "attestation.photoHashes.0": ["La huella debe corresponder a una foto del registro."],
        "evidencePayload.soil_ph": ["Ingresa un número válido."],
        notes: ["Máximo 1000 caracteres."],
      }),
    ).toEqual({
      location: ["La ubicación no es válida."],
      "photoHashes.0": ["La huella debe corresponder a una foto del registro."],
      "evidencePayload.soil_ph": ["Ingresa un número válido."],
      notes: ["Máximo 1000 caracteres."],
    });
  });

  it("collects every message under a prefix", () => {
    const errors = { "photoHashes.0": ["A"], "photoHashes.1.sha256": ["B"], photoHashes: ["C"], location: ["D"] };
    expect(errorsUnder(errors, "photoHashes")).toEqual(["C", "A", "B"]);
    expect(errorsUnder(errors, "notes")).toBeUndefined();
  });
});

describe("recording evidence with location and photo hashes", () => {
  const payload = { fertilizer_kg: 120, application_verified: true, field_photos: [P1, P2] };

  it("sends location and photo_hashes to the server and maps them back on the log", async () => {
    const store = createFixtureStore();
    const milestones = createMilestonesModule({ fetchFn: createMockFetch(store) });
    const result = await milestones.recordEvidenceFromForm(
      "ms-03",
      form([
        ["logType", "PHOTO_EVIDENCE"],
        ["notes", "Abono al pie"],
        ["fertilizer_kg", "120"],
        ["application_verified", "true"],
        ["field_photos", P1],
        ["field_photos", P2],
        ["latitude", "4.5"],
        ["longitude", "-75.6"],
        ["photoHashUrl", P1],
        ["photoHashSha256", HASH],
      ]),
    );
    expect(result.ok && result.value).toMatchObject({ location: { latitude: 4.5, longitude: -75.6 }, photoHashes: [{ url: P1, sha256: HASH }] });
    expect(store.find((m) => m.id === "ms-03")?.evidence_logs.at(-1)).toMatchObject({ photo_hashes: [{ url: P1, sha256: HASH }] });
  });

  it("refuses a hash that is not a 64-char lowercase hex or names a photo outside the log", async () => {
    const milestones = createMilestonesModule({ fetchFn: createMockFetch(createFixtureStore()) });
    const result = await milestones.recordEvidenceLog("ms-03", {
      logType: "PHOTO_EVIDENCE",
      notes: "",
      evidencePayload: payload,
      location: { latitude: 91, longitude: 0 },
      photoHashes: [
        { url: P1, sha256: "ABC" },
        { url: P3, sha256: HASH },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "validation") {
      expect(Object.keys(result.error.fieldErrors).sort()).toEqual(["location.latitude", "photoHashes.0.sha256", "photoHashes.1.url"]);
      expect(result.error.fieldErrors["photoHashes.1.url"]).toEqual(["La huella debe corresponder a una foto seleccionada del registro."]);
    } else {
      throw new Error("expected a validation error");
    }
  });

  it("surfaces a server 400 as field errors under the client keys", async () => {
    const store = createFixtureStore();
    const mock = createMockFetch(store);
    const server: typeof fetch = async (input, init) => {
      if ((init?.method ?? "GET") === "POST") {
        return new Response(JSON.stringify({ error: "Invalid", errors: { "attestation.location": ["La ubicación no es válida."] } }), { status: 400 });
      }
      return mock(input, init);
    };
    const repo = new HttpMilestoneRepository({ baseUrl: "/api", fetchFn: server });
    const result = await recordEvidenceLog(repo, "ms-03", { logType: "PHOTO_EVIDENCE", notes: "", evidencePayload: payload, location: { latitude: 4, longitude: -74 } });
    expect(result).toEqual({ ok: false, error: { kind: "validation", fieldErrors: { location: ["La ubicación no es válida."] } } });
  });
});
