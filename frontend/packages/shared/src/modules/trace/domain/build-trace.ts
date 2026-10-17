import type { GrantDetail } from "../../grants/domain/grant";
import type { Settlement } from "../../harvest/domain/harvest";
import { mockToken, type TraceEntry, type TraceHeader, type TraceOption, type TraceView } from "./trace";

// Builds the support trace from what the platform already stores (grant events, receipts, settlement lines). Pure and deterministic.

const PLATFORM_WALLET = "https://wallet.example/surco";
const PLATFORM_KEY_ID = "surco-key-2026";
const JSON_HEADER: TraceHeader = { name: "Content-Type", value: "application/json", secret: false };

// Open Payments splits a wallet into a resource server and an authorization server; the mock puts the latter under `auth.`.
const authServerOf = (walletUrl: string): string => {
  try {
    const u = new URL(walletUrl);
    return `${u.protocol}//auth.${u.host}`;
  } catch {
    return walletUrl;
  }
};

const slug = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const bearer = (seed: string): TraceHeader => ({ name: "Authorization", value: `GNAP ${mockToken(seed)}`, secret: true });
const signature = (seed: string): TraceHeader[] => [
  { name: "Signature-Input", value: `sig1=("@method" "@target-uri" "content-type");keyid="${PLATFORM_KEY_ID}"`, secret: false },
  { name: "Signature", value: `sig1=:${mockToken(`sig:${seed}`)}:`, secret: false },
];

const amount = (value: number, assetCode: string) => ({ value: String(value), assetCode, assetScale: 0 });

type Draft = Omit<TraceEntry, "id">;

export function buildTrace(grants: readonly GrantDetail[], settlements: readonly Settlement[]): TraceView {
  const drafts: Draft[] = [];

  for (const { grant, project, milestone, events, receipts } of grants) {
    const auth = authServerOf(grant.wallet);
    const base = { projectId: project.id, projectTitle: project.title, milestoneId: milestone.id, milestoneTitle: milestone.title };
    const subject = `Grant del hito ${milestone.sequenceOrder} · ${milestone.title}`;
    const continueId = mockToken(`continue-id:${grant.id}`).slice(0, 16);
    const continueToken = bearer(`continue:${grant.id}`);
    const grantToken = bearer(`access:${grant.id}`);

    drafts.push({
      ...base,
      step: "GRANT_REQUEST",
      subject,
      at: grant.createdAt,
      method: "POST",
      url: `${auth}/`,
      headers: [JSON_HEADER, ...signature(grant.id)],
      body: {
        access_token: {
          access: [
            {
              type: "outgoing-payment",
              actions: ["create", "read", "list"],
              identifier: grant.wallet,
              limits: { debitAmount: amount(grant.capAmount, grant.currency) },
            },
          ],
        },
        client: PLATFORM_WALLET,
        interact: { start: ["redirect"], finish: { method: "redirect", uri: `https://app.surco.example/investor/grants/${grant.id}/approve`, nonce: mockToken(`nonce:${grant.id}`).slice(0, 16) } },
      },
      expect: "200 con la URL de aprobación en la billetera y un token de continuación.",
    });

    if (grant.approvedAt) {
      drafts.push({
        ...base,
        step: "GRANT_CONTINUE",
        subject,
        at: grant.approvedAt,
        method: "POST",
        url: `${auth}/continue/${continueId}`,
        headers: [continueToken, JSON_HEADER, ...signature(`${grant.id}:continue`)],
        body: { interact_ref: grant.interactRef ?? "unknown" },
        expect: "200 con el access token y la manage_url; se verifica el hash de la interacción antes de guardarlos cifrados.",
      });
    }

    for (const e of events) {
      if (e.type !== "TOKEN_ROTATED") continue;
      drafts.push({
        ...base,
        step: "ROTATE_TOKEN",
        subject,
        at: e.at,
        method: "POST",
        url: `${auth}/token/${mockToken(`manage:${grant.id}`).slice(0, 16)}`,
        headers: [bearer(`manage:${grant.id}`), ...signature(`${grant.id}:rotate:${e.id}`)],
        body: null,
        expect: "200 con un access token nuevo; el anterior queda inactivo.",
      });
    }

    for (const r of receipts) {
      const line = `${subject} · línea ${r.lineId} · ${r.concept}`;
      const beneficiary = r.beneficiaryWallet;
      const quoteId = `${grant.wallet}/quotes/${mockToken(`quote:${r.id}`).slice(0, 12)}`;
      drafts.push(
        {
          ...base,
          step: "INCOMING_PAYMENT",
          subject: line,
          at: r.createdAt,
          method: "POST",
          url: `${beneficiary}/incoming-payments`,
          headers: [bearer(`receiver:${r.id}`), JSON_HEADER, ...signature(`${r.id}:incoming`)],
          body: { walletAddress: beneficiary, incomingAmount: amount(r.received, grant.currency), metadata: { description: r.concept, idempotencyKey: r.idempotencyKey } },
          expect: `201 con el incoming payment ${r.incomingPaymentId}.`,
        },
        {
          ...base,
          step: "QUOTE",
          subject: line,
          at: r.createdAt,
          method: "POST",
          url: `${grant.wallet}/quotes`,
          headers: [grantToken, JSON_HEADER, ...signature(`${r.id}:quote`)],
          body: { walletAddress: grant.wallet, receiver: r.incomingPaymentId, method: "ilp", receiveAmount: amount(r.received, grant.currency) },
          expect: `201 con ${quoteId}; la comisión (${r.fee}) se suma al débito de la cotización.`,
        },
        {
          ...base,
          step: "OUTGOING_PAYMENT",
          subject: line,
          at: r.createdAt,
          method: "POST",
          url: `${grant.wallet}/outgoing-payments`,
          headers: [grantToken, JSON_HEADER, { name: "Idempotency-Key", value: r.idempotencyKey, secret: false }, ...signature(`${r.id}:outgoing`)],
          body: { walletAddress: grant.wallet, quoteId, metadata: { lineId: r.lineId, idempotencyKey: r.idempotencyKey } },
          expect: `201 con el outgoing payment ${r.outgoingPaymentId}; débito total ${r.debited}.`,
        },
        {
          ...base,
          step: "VERIFICATION",
          subject: line,
          at: r.createdAt,
          method: "GET",
          url: r.outgoingPaymentId,
          headers: [grantToken, ...signature(`${r.id}:verify`)],
          body: null,
          expect: `200 con el estado final; se vuelve a consultar el grant para el comprobante (gastado ${r.spentAfter}).`,
        },
      );
    }

    if (grant.revokedAt) {
      const probe = events.find((e) => e.type === "REVOCATION_VERIFIED");
      drafts.push(
        {
          ...base,
          step: "REVOKE",
          subject,
          at: grant.revokedAt,
          method: "DELETE",
          url: `${auth}/continue/${continueId}`,
          headers: [continueToken, ...signature(`${grant.id}:revoke`)],
          body: null,
          expect: `${grant.revocation?.deleteResponseStatus ?? 204} sin contenido; el permiso queda cancelado.`,
        },
        {
          ...base,
          step: "VERIFICATION",
          subject: `${subject} · prueba posterior a la revocación`,
          at: probe?.at ?? grant.revokedAt,
          method: "POST",
          url: `${grant.wallet}/outgoing-payments`,
          headers: [grantToken, JSON_HEADER, ...signature(`${grant.id}:probe`)],
          body: { walletAddress: grant.wallet, quoteId: `${grant.wallet}/quotes/probe`, metadata: { probe: true } },
          expect: `${typeof probe?.detail.probe_status === "number" ? probe.detail.probe_status : 403}: el pago posterior a la revocación debe ser rechazado.`,
        },
      );
    }
  }

  for (const s of settlements) {
    const payer = "https://wallet.example/buyer";
    const base = { projectId: s.projectId, projectTitle: s.projectTitle, milestoneId: null, milestoneTitle: "Liquidación de la cosecha" };
    for (const line of s.lines) {
      if (line.state !== "completado") continue;
      const beneficiary = `https://wallet.example/${slug(line.beneficiaryName)}`;
      const subject = `Liquidación ${s.id} · ${line.beneficiaryName}`;
      const at = line.executedAt ?? s.createdAt;
      const incomingId = line.incomingPaymentId ?? `${beneficiary}/incoming-payments/unknown`;
      const token = bearer(`order-grant:${s.orderId}`);
      drafts.push(
        {
          ...base,
          step: "INCOMING_PAYMENT",
          subject,
          at,
          method: "POST",
          url: `${beneficiary}/incoming-payments`,
          headers: [bearer(`receiver:${line.id}`), JSON_HEADER, ...signature(`${line.id}:incoming`)],
          body: { walletAddress: beneficiary, incomingAmount: amount(line.amount, s.currency), metadata: { settlementLine: line.id } },
          expect: `201 con el incoming payment ${incomingId}.`,
        },
        {
          ...base,
          step: "QUOTE",
          subject,
          at,
          method: "POST",
          url: `${payer}/quotes`,
          headers: [token, JSON_HEADER, ...signature(`${line.id}:quote`)],
          body: { walletAddress: payer, receiver: incomingId, method: "ilp", receiveAmount: amount(line.amount, s.currency) },
          expect: "201 con la cotización de la línea.",
        },
        {
          ...base,
          step: "OUTGOING_PAYMENT",
          subject,
          at,
          method: "POST",
          url: `${payer}/outgoing-payments`,
          headers: [token, JSON_HEADER, { name: "Idempotency-Key", value: `${s.orderId}:${line.id}`, secret: false }, ...signature(`${line.id}:outgoing`)],
          body: { walletAddress: payer, quoteId: `${payer}/quotes/${mockToken(`quote:${line.id}`).slice(0, 12)}`, metadata: { settlementLine: line.id } },
          expect: `201 con el outgoing payment ${line.outgoingPaymentId ?? "pendiente"}.`,
        },
      );
    }
    if (s.revocation) {
      drafts.push({
        ...base,
        step: "REVOKE",
        subject: `Liquidación ${s.id} · grant de la orden ${s.orderId}`,
        at: s.revocation.revokedAt,
        method: "DELETE",
        url: `${authServerOf(payer)}/continue/${mockToken(`order-continue:${s.orderId}`).slice(0, 16)}`,
        headers: [bearer(`order-continue:${s.orderId}`), ...signature(`${s.id}:revoke`)],
        body: null,
        expect: `${s.revocation.responseStatus} sin contenido; el grant de la orden queda cancelado.`,
      });
    }
  }

  const entries: TraceEntry[] = drafts
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((d, i) => ({ ...d, id: `trace-${String(i + 1).padStart(4, "0")}` }));

  const projects: TraceOption[] = [];
  const milestones: TraceView["milestones"] = [];
  for (const e of entries) {
    if (e.projectId && !projects.some((p) => p.id === e.projectId)) projects.push({ id: e.projectId, label: e.projectTitle });
    if (e.milestoneId && !milestones.some((m) => m.id === e.milestoneId)) milestones.push({ id: e.milestoneId, label: `${e.projectTitle} · ${e.milestoneTitle}`, projectId: e.projectId });
  }
  return { entries, projects, milestones };
}
