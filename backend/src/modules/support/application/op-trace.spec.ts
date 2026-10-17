import { buildTrace, currentCorrelation, redact, renderCurl, trimSecret, withOpTraceContext } from "./op-trace";

describe("trimSecret", () => {
  it("keeps the first 6 characters and an ellipsis", () => {
    expect(trimSecret("abcdefghijklmnop")).toBe("abcdef…");
  });
  it("never shows a short secret whole", () => {
    expect(trimSecret("abc")).toBe("…");
  });
});

describe("redact (RF-28)", () => {
  it("trims tokens, nonces, interact refs and hashes, at any depth, and leaves the rest", () => {
    const out = redact({
      access_token: { value: "secret-access-token", manage: "https://auth.test/token/abcdef123", access: [{ type: "outgoing-payment", actions: ["create"] }] },
      interact: { finish: { method: "redirect", uri: "https://api.test/cb", nonce: "client-nonce-1234" } },
      interact_ref: "interact-ref-9999",
      continue: { uri: "https://auth.test/continue/1", access_token: { value: "continue-token-xyz" } },
      walletAddress: "https://ilp.test/custody",
    });
    expect(out).toEqual({
      access_token: { value: "secret…", manage: "https:…", access: [{ type: "outgoing-payment", actions: ["create"] }] },
      interact: { finish: { method: "redirect", uri: "https://api.test/cb", nonce: "client…" } },
      interact_ref: "intera…",
      continue: { uri: "https://auth.test/continue/1", access_token: { value: "contin…" } },
      walletAddress: "https://ilp.test/custody",
    });
  });

  it("never mutates its input", () => {
    const input = { accessToken: "full-token-value" };
    redact(input);
    expect(input.accessToken).toBe("full-token-value");
  });
});

describe("renderCurl", () => {
  it("renders method, url, the trimmed GNAP token and the redacted JSON body", () => {
    const curl = renderCurl({ method: "POST", url: "https://rs.test/incoming-payments", accessToken: "incoming-payment-token", body: { walletAddress: "https://ilp.test/r" } });
    expect(curl).toBe(
      `curl -X POST 'https://rs.test/incoming-payments' -H 'Authorization: GNAP incomi…' -H 'Content-Type: application/json' -d '{"walletAddress":"https://ilp.test/r"}'`,
    );
    expect(curl).not.toContain("incoming-payment-token");
  });

  it("renders a GET without token nor body", () => {
    expect(renderCurl({ method: "GET", url: "https://ilp.test/custody", accessToken: null, body: null })).toBe("curl -X GET 'https://ilp.test/custody'");
  });

  it("escapes single quotes in the body", () => {
    expect(renderCurl({ method: "POST", url: "https://x.test", accessToken: null, body: { note: "it's" } })).toContain(`'{"note":"it'\\''s"}'`);
  });
});

describe("buildTrace", () => {
  it("derives the project from a project milestone id and stores no full secret anywhere", () => {
    const trace = buildTrace({
      call: { method: "POST", url: "https://auth.test", accessToken: "very-secret-token", body: { interact_ref: "interact-ref-full" } },
      status: 200,
      durationMs: 12,
      response: { access_token: { value: "issued-token-full" } },
      error: null,
      correlation: { milestoneId: "p-1-ms-2" },
      now: new Date("2026-10-17T00:00:00Z"),
      id: "t-1",
    });
    expect(trace).toMatchObject({ id: "t-1", method: "POST", status: 200, durationMs: 12, projectId: "p-1", milestoneId: "p-1-ms-2" });
    const serialized = JSON.stringify(trace);
    for (const secret of ["very-secret-token", "interact-ref-full", "issued-token-full"]) expect(serialized).not.toContain(secret);
  });

  it("caps the response summary", () => {
    const trace = buildTrace({
      call: { method: "GET", url: "https://x.test", accessToken: null, body: null },
      status: 200,
      durationMs: 1,
      response: { data: "x".repeat(5000) },
      error: null,
      correlation: {},
      now: new Date(),
      id: "t-2",
    });
    expect(trace.responseSummary?.length).toBeLessThanOrEqual(1001);
  });
});

describe("withOpTraceContext", () => {
  it("exposes the correlation inside, merged with an outer one, and nothing outside", async () => {
    expect(currentCorrelation()).toEqual({});
    await withOpTraceContext({ projectId: "p-1" }, () =>
      withOpTraceContext({ milestoneId: "p-1-ms-1" }, async () => {
        expect(currentCorrelation()).toEqual({ projectId: "p-1", milestoneId: "p-1-ms-1" });
      }),
    );
    expect(currentCorrelation()).toEqual({});
  });
});
