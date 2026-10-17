import { ValidationError } from "../../../shared/domain-errors";
import { validateEvidenceLog } from "./milestone-progress";
import type { Requirement } from "./milestone";

const requirements: Requirement[] = [{ fieldKey: "fotos", label: "Fotos", type: "photo_array", minItems: 1 }];
const PHOTO = "https://img.test/1.jpg";
const HASH = "ab".repeat(32);
const log = (attestation: unknown) => ({ logType: "PHOTO_EVIDENCE", notes: "ok", evidencePayload: { fotos: [PHOTO] }, attestation });
const fieldErrors = (attestation: unknown) => {
  try {
    validateEvidenceLog(requirements, log(attestation));
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors;
    throw error;
  }
};

describe("evidence attestation (RF-19/RF-35: location and photo hash)", () => {
  it("keeps the location and a lowercase sha256 per photo", () => {
    expect(validateEvidenceLog(requirements, log({ location: { latitude: 4.65, longitude: -74.05 }, photoHashes: [{ url: PHOTO, sha256: HASH.toUpperCase() }] }))).toEqual({
      logType: "PHOTO_EVIDENCE",
      notes: "ok",
      evidencePayload: { fotos: [PHOTO] },
      attestation: { location: { latitude: 4.65, longitude: -74.05 }, photoHashes: [{ url: PHOTO, sha256: HASH }] },
    });
  });

  it("is optional: a log without it has no attestation key (the existing contract)", () => {
    expect(validateEvidenceLog(requirements, log(undefined))).not.toHaveProperty("attestation");
    expect(validateEvidenceLog(requirements, log(null))).not.toHaveProperty("attestation");
  });

  it("rejects coordinates out of range", () => {
    expect(fieldErrors({ location: { latitude: 91, longitude: 0 } })).toEqual({ "attestation.location": ["La ubicación no es válida."] });
    expect(fieldErrors({ location: { latitude: 0, longitude: -181 } })).toHaveProperty(["attestation.location"]);
  });

  it("rejects a hash that is not sha256 hex, one for a photo the log does not carry, and a second hash for the same photo", () => {
    expect(fieldErrors({ photoHashes: [{ url: PHOTO, sha256: "xyz" }] })).toEqual({ "attestation.photoHashes.0": ["La huella debe ser un SHA-256 en hexadecimal."] });
    expect(fieldErrors({ photoHashes: [{ url: "https://img.test/other.jpg", sha256: HASH }] })).toEqual({
      "attestation.photoHashes.0": ["La huella debe corresponder a una foto del registro."],
    });
    expect(fieldErrors({ photoHashes: [{ url: PHOTO, sha256: HASH }, { url: PHOTO, sha256: HASH }] })).toEqual({ "attestation.photoHashes.1": ["Esa foto ya tiene huella."] });
  });
});
