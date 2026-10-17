import { Controller, Get, Query, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import type { OpTrace } from "../application/op-trace";
import type { PaymentStep } from "../application/payment-step";
import { OpTraceRepository } from "../ports/op-trace.repository";
import { PaymentStepRepository } from "../ports/payment-step.repository";

const { operator, fiduciaria } = MILESTONE_ROLES;

export const DEFAULT_TRACE_LIMIT = 100;
export const MAX_TRACE_LIMIT = 500;

export const DEFAULT_STEP_LIMIT = 200;

/** A bad or missing limit falls back to the default; anything above the cap is capped. */
export function parseTraceLimit(raw: unknown, fallback = DEFAULT_TRACE_LIMIT): number {
  const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : fallback;
  return Math.min(Math.max(n, 1), MAX_TRACE_LIMIT);
}

export const toTraceResponse = (t: OpTrace) => ({
  id: t.id,
  method: t.method,
  url: t.url,
  status: t.status,
  duration_ms: t.durationMs,
  request_body: t.requestBody,
  response_summary: t.responseSummary,
  error: t.error,
  curl: t.curl,
  project_id: t.projectId,
  milestone_id: t.milestoneId,
  negotiation_id: t.negotiationId,
  investment_id: t.investmentId,
  settlement_id: t.settlementId,
  created_at: t.createdAt.toISOString(),
});

export const toPaymentStepResponse = (s: PaymentStep) => ({
  payment_kind: s.kind,
  payment_id: s.paymentId,
  step: s.step,
  at: s.at.toISOString(),
  op_url: s.opUrl,
  detail: s.detail,
  project_id: s.projectId,
});

// RF-28: the support view of every Open Payments request, newest first, tokens already trimmed at write time.
// ponytail: no swagger DTOs and openapi.yaml not regenerated for these routes yet.
@ApiTags("support")
@Controller("api/support")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter)
@Roles(operator, fiduciaria)
export class SupportController {
  constructor(
    private readonly traces: OpTraceRepository,
    private readonly steps: PaymentStepRepository,
  ) {}

  /** Open Payments requests as curl (RF-28); ?project_id narrows to one project, ?limit (default 100, max 500) */
  @Get("traces")
  async list(@Query("project_id") projectId?: string, @Query("limit") limit?: string) {
    const traces = await this.traces.list({ projectId: projectId || undefined, limit: parseTraceLimit(limit) });
    return traces.map(toTraceResponse);
  }

  /** Payment step timeline, oldest first; ?project_id, ?payment_kind, ?payment_id narrow it, ?limit (default 200, max 500) */
  @Get("payment-steps")
  async listSteps(
    @Query("project_id") projectId?: string,
    @Query("payment_kind") paymentKind?: string,
    @Query("payment_id") paymentId?: string,
    @Query("limit") limit?: string,
  ) {
    const steps = await this.steps.list({
      projectId: projectId || undefined,
      paymentKind: paymentKind || undefined,
      paymentId: paymentId || undefined,
      limit: parseTraceLimit(limit, DEFAULT_STEP_LIMIT),
    });
    return steps.map(toPaymentStepResponse);
  }
}
