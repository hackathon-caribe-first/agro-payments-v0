import { canRecordEvidence, canSubmitForReview } from "../../domain/milestone-rules";
import { buildEvidenceSchema } from "../../schemas/evidence-log";
import { evidenceLogRequestDtoSchema, type MilestoneDetailDto, type MilestoneSummaryDto } from "../dto";
import { toMilestoneDetail } from "../mapper";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const problem = (status: number, message: string) => json({ error: message }, status);

const toSummaryDto = (m: MilestoneDetailDto): MilestoneSummaryDto => ({
  id: m.id,
  project_id: m.project_id,
  sequence_order: m.sequence_order,
  title: m.title,
  status: m.status,
  supplies_budget: m.supplies_budget,
  labor_budget: m.labor_budget,
  supplies_executed: m.supplies_executed,
  labor_executed: m.labor_executed,
  currency: m.currency,
});

// An in-memory stand-in for the network: same routes and status codes the real backend is expected to expose.
// It re-enforces the transition rules (409) and payload validation (400) like a server would.
export function createMockFetch(store: MilestoneDetailDto[]): typeof fetch {
  let nextLogNumber = store.reduce((n, m) => n + m.evidence_logs.length, 0) + 1;
  let nextReviewNumber = store.reduce((n, m) => n + m.reviews.length, 0) + 1;
  const find = (id: string) => store.find((m) => m.id === id);

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    const projectList = path.match(/^\/projects\/([^/]+)\/milestones$/);
    if (method === "GET" && projectList) {
      return json(store.filter((m) => m.project_id === projectList[1]).map(toSummaryDto));
    }

    const detail = path.match(/^\/milestones\/([^/]+)$/);
    if (method === "GET" && detail) {
      const m = find(detail[1]);
      return m ? json(m) : problem(404, "Milestone not found");
    }

    const logs = path.match(/^\/milestones\/([^/]+)\/logs$/);
    if (method === "POST" && logs) {
      const m = find(logs[1]);
      if (!m) return problem(404, "Milestone not found");
      if (!canRecordEvidence(m.status)) return problem(409, `Evidence is not accepted in status ${m.status}`);

      const body = evidenceLogRequestDtoSchema.safeParse(JSON.parse(String(init?.body ?? "null")));
      if (!body.success) return problem(400, "Invalid log request");
      const requirements = toMilestoneDetail(m).requirements;
      if (!buildEvidenceSchema(requirements).safeParse(body.data.evidence_payload).success) {
        return problem(400, "Evidence payload does not match the milestone requirements");
      }

      const log = {
        id: `log-${String(nextLogNumber++).padStart(2, "0")}`,
        milestone_id: m.id,
        created_at: new Date().toISOString(),
        ...body.data,
      };
      m.evidence_logs.push(log);
      return json(log, 201);
    }

    const submit = path.match(/^\/milestones\/([^/]+)\/submit$/);
    if (method === "POST" && submit) {
      const m = find(submit[1]);
      if (!m) return problem(404, "Milestone not found");
      if (!canSubmitForReview(toMilestoneDetail(m))) return problem(409, "Milestone cannot be submitted for review");

      m.status = "SUBMITTED_FOR_REVIEW";
      m.reviews.push({
        id: `rev-${String(nextReviewNumber++).padStart(2, "0")}`,
        verdict: "SUBMITTED",
        comment: null,
        created_at: new Date().toISOString(),
      });
      return json(m);
    }

    return problem(404, `No route for ${method} ${path}`);
  };
}
