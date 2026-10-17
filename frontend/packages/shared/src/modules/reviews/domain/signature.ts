// Signature hash of a dictamen (SHA-256 of its canonical JSON). Uses crypto.subtle when present; otherwise a
// deterministic 256-bit fallback (eight FNV-1a lanes) so the flow works in non-secure contexts and in tests.

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function fallbackHash(text: string): string {
  let out = "";
  for (let lane = 0; lane < 8; lane++) {
    let h = (0x811c9dc5 ^ (lane * 0x9e3779b1)) >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return fallbackHash(text);
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The payload a verifier signs: everything that makes the dictamen what it is, nothing derived.
export interface DictamenPayload {
  milestoneId: string;
  verifierId: string;
  verdict: string;
  comments: string;
  technicalEvaluation: unknown[];
  subsanaciones: string[];
}

// Same normalization the dictamen schema applies (trim), so client and server hash the very same bytes.
export function normalizePayload(payload: DictamenPayload): DictamenPayload {
  return {
    milestoneId: payload.milestoneId,
    verifierId: payload.verifierId,
    verdict: payload.verdict,
    comments: payload.comments.trim(),
    technicalEvaluation: (payload.technicalEvaluation as Record<string, unknown>[]).map((c) => ({
      fieldKey: c.fieldKey,
      label: c.label,
      passed: c.passed,
      observed: typeof c.observed === "string" ? c.observed.trim() : c.observed,
      reason: typeof c.reason === "string" ? c.reason.trim() : c.reason,
    })),
    subsanaciones: payload.subsanaciones.map((s) => s.trim()).filter((s) => s !== ""),
  };
}

export const signDictamen = (payload: DictamenPayload) => sha256Hex(canonicalJson(normalizePayload(payload)));
export const signDictamenFallback = (payload: DictamenPayload) => fallbackHash(canonicalJson(normalizePayload(payload)));
