import { FORM_LEVEL_KEY, type FieldErrors } from "../../../milestones/domain/errors";
import type { RejectionBody } from "../../../projects/infrastructure/dto";
import type { PresalesMockStore } from "../../../presales/infrastructure/mock/store";
import { NOTIFICATION_ROLES, QUEUE_TABS, type NotificationRole, type QueueTab } from "../../domain/review";
import { canIssueDictamen } from "../../domain/review-rules";
import { signDictamen } from "../../domain/signature";
import { dictamenInputSchema, toFieldErrors } from "../../schemas/dictamen";
import { confirmPayoutRequestDtoSchema, dictamenRequestDtoSchema } from "../dto";
import { applyDictamen, assignmentFor, buildDetail, buildQueue, confirmPayout, hasSignedApprovalFor, seedReviews, syncSubmissionNotifications } from "./engine";
import { createReviewsState, type ReviewsState } from "./state";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Both failure kinds use the shared rejection shape: { error, errors: { path: [messages] } }.
const reject = (status: 400 | 409, errors: RejectionBody["errors"]) => json({ error: "Request rejected", errors }, status);
const invalid = (errors: FieldErrors) => reject(400, errors);
const conflict = (message: string) => reject(409, { [FORM_LEVEL_KEY]: [message] });
const malformed = () => invalid({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] });
const notFound = (what: string) => json({ error: `${what} not found` }, 404);

const readBody = (init?: RequestInit): unknown => {
  try {
    return init?.body ? JSON.parse(String(init.body)) : null;
  } catch {
    return null;
  }
};

const isRole = (value: string | null): value is NotificationRole => (NOTIFICATION_ROLES as readonly (string | null)[]).includes(value);
const isTab = (value: string | null): value is QueueTab => (QUEUE_TABS as readonly (string | null)[]).includes(value);

// Mock backend of the verification flow: /reviews/** and /notifications/**. Everything else goes to `delegate`.
// Milestones and projects are read and (for the documented transitions only) mutated IN PLACE in the shared store, so the
// producer pages see the verifier's comments and status changes. Own state (audit entries, notifications, outbox, payouts)
// is module-local.
export function createReviewsMockFetch(base: PresalesMockStore, delegate: typeof fetch, state: ReviewsState = createReviewsState()): typeof fetch {
  seedReviews(base, state);
  const findMilestone = (id: string) => base.milestones.find((m) => m.id === id);

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    if (method === "GET" && /^\/reviews\/queue$/.test(path)) {
      const verifierId = url.searchParams.get("verifier_id");
      const tab = url.searchParams.get("tab") ?? "pending";
      if (!verifierId) return invalid({ verifier_id: ["Falta el verificador."] });
      if (!isTab(tab)) return invalid({ tab: ["Pestaña no válida."] });
      return json(buildQueue(base, state, verifierId, tab));
    }

    if (method === "GET" && /^\/reviews\/outbox$/.test(path)) return json(state.outbox);

    // The integrator acknowledges an outbox event once it acted on it: it leaves the queue.
    const consume = path.match(/^\/reviews\/outbox\/([^/]+)\/consume$/);
    if (method === "POST" && consume) {
      const index = state.outbox.findIndex((e) => e.id === decodeURIComponent(consume[1]));
      if (index < 0) return notFound("Outbox event");
      const [event] = state.outbox.splice(index, 1);
      return json(event);
    }

    const detail = path.match(/^\/reviews\/([^/]+)$/);
    if (method === "GET" && detail) {
      const m = findMilestone(decodeURIComponent(detail[1]));
      if (!m) return notFound("Milestone");
      return json(buildDetail(base, state, m, url.searchParams.get("verifier_id") ?? ""));
    }

    const dictamen = path.match(/^\/reviews\/([^/]+)\/dictamen$/);
    if (method === "POST" && dictamen) {
      const m = findMilestone(decodeURIComponent(dictamen[1]));
      if (!m) return notFound("Milestone");
      const body = dictamenRequestDtoSchema.safeParse(readBody(init));
      if (!body.success) return malformed();

      if (assignmentFor(m.project_id).verifier_id !== body.data.verifier_id) {
        return conflict("Solo el verificador asignado al proyecto puede emitir el dictamen.");
      }
      if (!canIssueDictamen(m.status)) return conflict("Este hito no está en revisión técnica.");

      const technicalEvaluation = body.data.technical_evaluation.map((c) => ({ fieldKey: c.field_key, label: c.label, passed: c.passed, observed: c.observed, reason: c.reason }));
      const parsed = dictamenInputSchema.safeParse({
        verdict: body.data.verdict,
        comments: body.data.comments,
        technicalEvaluation,
        subsanaciones: body.data.subsanaciones,
        signatureHash: body.data.signature_hash,
      });
      if (!parsed.success) return invalid(toFieldErrors(parsed.error));

      const evaluated = new Set(body.data.technical_evaluation.map((c) => c.field_key));
      const missing = m.required_evidences.filter((r) => !evaluated.has(r.field_key)).map((r) => r.label);
      if (missing.length > 0) return invalid({ technicalEvaluation: [`Falta evaluar: ${missing.join(", ")}.`] });

      const expected = await signDictamen({
        milestoneId: m.id,
        verifierId: body.data.verifier_id,
        verdict: parsed.data.verdict,
        comments: parsed.data.comments,
        technicalEvaluation: parsed.data.technicalEvaluation,
        subsanaciones: parsed.data.subsanaciones,
      });
      if (expected !== parsed.data.signatureHash) return invalid({ signatureHash: ["La firma no coincide con el contenido del dictamen."] });

      // Persist the normalized values the signature covers.
      return json(
        applyDictamen(base, state, m, {
          ...body.data,
          comments: parsed.data.comments,
          subsanaciones: parsed.data.subsanaciones,
          technical_evaluation: parsed.data.technicalEvaluation.map((c) => ({ field_key: c.fieldKey, label: c.label, passed: c.passed, observed: c.observed, reason: c.reason })),
        }),
        201,
      );
    }

    const payout = path.match(/^\/reviews\/([^/]+)\/confirm-payout$/);
    if (method === "POST" && payout) {
      const m = findMilestone(decodeURIComponent(payout[1]));
      if (!m) return notFound("Milestone");
      const body = confirmPayoutRequestDtoSchema.safeParse(readBody(init) ?? {});
      if (!body.success) return malformed();
      if (m.status !== "LABOR_PAYOUT_PENDING") return conflict("Este hito no tiene un pago de mano de obra pendiente.");
      // PRD invariant: payout only with an APPROVED_FAVORABLE dictamen signed by the assigned verifier.
      if (!hasSignedApprovalFor(state, m)) return conflict("No hay un dictamen aprobado y firmado por el verificador asignado.");
      return json(confirmPayout(base, state, m, body.data.actor_id ?? "platform"), 201);
    }

    if (method === "GET" && /^\/notifications$/.test(path)) {
      const role = url.searchParams.get("role");
      if (!isRole(role)) return invalid({ role: ["Rol no válido."] });
      syncSubmissionNotifications(base, state);
      return json(state.notifications.filter((n) => n.role === role));
    }

    if (method === "POST" && /^\/notifications\/read-all$/.test(path)) {
      const role = url.searchParams.get("role");
      if (!isRole(role)) return invalid({ role: ["Rol no válido."] });
      const at = state.now();
      for (const n of state.notifications) if (n.role === role && n.read_at === null) n.read_at = at;
      return json({ ok: true });
    }

    const read = path.match(/^\/notifications\/([^/]+)\/read$/);
    if (method === "POST" && read) {
      const n = state.notifications.find((x) => x.id === decodeURIComponent(read[1]));
      if (!n) return notFound("Notification");
      n.read_at ??= state.now();
      return json(n);
    }

    return delegate(input, init);
  };
}
