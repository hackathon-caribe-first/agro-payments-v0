import { z } from "zod";
import { BoundaryError } from "../../milestones/domain/errors";
import { toProject } from "../../projects/infrastructure/mapper";
import { INVESTMENT_STATUSES, type Capture, type InvestorProject, type Investment, type InvestmentStatus } from "../domain/investment";
import { captureDtoSchema, investmentDtoSchema, investorProjectDtoSchema, type CaptureDto, type InvestmentDto } from "./dto";

function parse<S extends z.ZodType>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new BoundaryError(`Invalid ${what}: ${first?.path.join(".") || "(root)"} ${first?.message ?? ""}`.trim());
  }
  return result.data;
}

const toStatus = (raw: string): InvestmentStatus => ((INVESTMENT_STATUSES as readonly string[]).includes(raw) ? (raw as InvestmentStatus) : "UNKNOWN");

const fromCapture = (dto: CaptureDto): Capture => ({
  targetAmount: dto.target_amount,
  raised: dto.raised,
  currency: dto.currency,
  progressPct: dto.progress_pct,
  investorsCount: dto.investors_count,
  byCurrency: dto.by_currency.map((c) => ({ currency: c.currency, debited: c.debited, receivedCop: c.received_cop })),
});

const fromInvestment = (dto: InvestmentDto): Investment => ({
  id: dto.id,
  projectId: dto.project_id,
  investorId: dto.investor_id,
  walletAddress: dto.wallet_address,
  status: toStatus(dto.status),
  failureReason: dto.failure_reason,
  amount: dto.amount,
  currency: dto.currency,
  quote: dto.quote && {
    id: dto.quote.id,
    debitAmount: dto.quote.debit_amount,
    debitAssetCode: dto.quote.debit_asset_code,
    debitAssetScale: dto.quote.debit_asset_scale,
    receiveAmount: dto.quote.receive_amount,
    expiresAt: dto.quote.expires_at,
  },
  impliedRate: dto.implied_rate,
  incomingPaymentId: dto.incoming_payment_id,
  outgoingPaymentId: dto.outgoing_payment_id,
  createdAt: dto.created_at,
  capturedAt: dto.captured_at,
  ...(dto.consent_redirect_url ? { consentRedirectUrl: dto.consent_redirect_url } : {}),
});

const fromInvestorProject = (data: unknown): InvestorProject => {
  const dto = parse(investorProjectDtoSchema, data, "investor project");
  const { capture, ...project } = dto;
  return { project: toProject(project), capture: fromCapture(capture) };
};

export const toInvestorProject = fromInvestorProject;
export const toInvestorProjects = (data: unknown): InvestorProject[] => parse(z.array(z.unknown()), data, "investor projects").map(fromInvestorProject);
export const toCapture = (data: unknown): Capture => fromCapture(parse(captureDtoSchema, data, "capture"));
export const toInvestment = (data: unknown): Investment => fromInvestment(parse(investmentDtoSchema, data, "investment"));
export const toInvestments = (data: unknown): Investment[] => parse(z.array(investmentDtoSchema), data, "investments").map(fromInvestment);
