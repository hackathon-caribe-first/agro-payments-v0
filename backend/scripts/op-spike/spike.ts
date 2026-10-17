// Manual Open Payments testnet spike. Run: pnpm install && pnpm spike (loads env from shell).
import { createInterface } from "node:readline/promises";
import {
  createAuthenticatedClient,
  isFinalizedGrantWithAccessToken,
  isPendingGrant,
  type AuthenticatedClient,
} from "@interledger/open-payments";

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var ${k}`);
  return v;
};
const ask = async (q: string) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(q);
  rl.close();
  return a.trim();
};
const log = (label: string, data: unknown) => console.log(`\n[${label}]`, JSON.stringify(data, null, 2));
const attempt = async <T>(label: string, fn: () => Promise<T>) => {
  try {
    const r = await fn();
    log(`${label}: OK`, r);
    return { ok: true as const, value: r };
  } catch (e) {
    log(`${label}: REJECTED`, String(e));
    return { ok: false as const, error: e };
  }
};

const CAP = 1000n; // minor units (debit cap X)
const PAY = 400n;

async function main() {
  const client: AuthenticatedClient = await createAuthenticatedClient({
    walletAddressUrl: env("OP_WALLET_ADDRESS"),
    keyId: env("OP_KEY_ID"),
    privateKey: env("OP_PRIVATE_KEY_PATH"),
  });
  const sender = await client.walletAddress.get({ url: env("OP_WALLET_ADDRESS") });
  const receiver = await client.walletAddress.get({ url: env("OP_RECEIVER_WALLET_ADDRESS") });

  // Receiver side: incoming payment grant + incoming payment
  const inGrant = await client.grant.request({ url: receiver.authServer }, {
    access_token: { access: [{ type: "incoming-payment", actions: ["create", "read", "complete"] }] },
  });
  if (!isFinalizedGrantWithAccessToken(inGrant)) throw new Error("Unexpected interactive incoming grant");
  const newIncoming = (value?: string) =>
    client.incomingPayment.create(
      { url: receiver.resourceServer, accessToken: inGrant.access_token.value },
      {
        walletAddress: receiver.id,
        ...(value && { incomingAmount: { value, assetCode: receiver.assetCode, assetScale: receiver.assetScale } }),
      },
    );

  // Quote grant
  const quoteGrant = await client.grant.request({ url: sender.authServer }, {
    access_token: { access: [{ type: "quote", actions: ["create", "read"] }] },
  });
  if (!isFinalizedGrantWithAccessToken(quoteGrant)) throw new Error("Unexpected interactive quote grant");
  const quoteFor = async (incomingId: string, receiveAmount?: string) =>
    client.quote.create(
      { url: sender.resourceServer, accessToken: quoteGrant.access_token.value },
      { walletAddress: sender.id, receiver: incomingId, method: "ilp", ...(receiveAmount && {
        receiveAmount: { value: receiveAmount, assetCode: receiver.assetCode, assetScale: receiver.assetScale } }) },
    );

  // (a) Outgoing grant: debitAmount cap with NO interval. Needs manual consent.
  const outGrant = await client.grant.request({ url: sender.authServer }, {
    access_token: { access: [{
      type: "outgoing-payment", actions: ["create", "read"], identifier: sender.id,
      limits: { debitAmount: { value: CAP.toString(), assetCode: sender.assetCode, assetScale: sender.assetScale } },
    }] },
    interact: { start: ["redirect"] },
  });
  if (!isPendingGrant(outGrant)) throw new Error("Expected pending (interactive) grant");
  console.log(`\nOpen this URL and approve the grant:\n${outGrant.interact.redirect}`);
  const interactRef = await ask("Paste interact_ref from the redirect URL: ");
  const finalized = await client.grant.continue(
    { url: outGrant.continue.uri, accessToken: outGrant.continue.access_token.value },
    { interact_ref: interactRef },
  );
  if (!isFinalizedGrantWithAccessToken(finalized)) throw new Error("Grant not finalized after continue");
  const out = { url: sender.resourceServer, accessToken: finalized.access_token.value };

  const pay = async (amount: string) => {
    const inc = await newIncoming();
    const q = await quoteFor(inc.id, amount);
    log("quote", { debitAmount: q.debitAmount, receiveAmount: q.receiveAmount });
    return client.outgoingPayment.create(out, { walletAddress: sender.id, quoteId: q.id });
  };

  log("(a) within cap", await attempt("pay <= cap", () => pay(PAY.toString())));
  await attempt("pay over remaining cap", () => pay((CAP).toString()));

  // (c) fixed receiveAmount quote: record debit vs receive
  const incC = await newIncoming();
  await attempt("(c) fixed receiveAmount quote", async () => {
    const q = await quoteFor(incC.id, "100");
    return { debitAmount: q.debitAmount, receiveAmount: q.receiveAmount };
  });

  // (b) revoke grant then pay
  await attempt("(b) revoke grant", () =>
    client.grant.cancel({ url: finalized.continue.uri, accessToken: finalized.continue.access_token.value }),
  );
  await attempt("(b) pay after revoke", () => pay("100"));
  console.log("\nRecord results in FINDINGS.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
