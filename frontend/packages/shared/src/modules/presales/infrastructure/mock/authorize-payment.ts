import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import type { PaymentAuthorizationDto } from "../../../payment-authorization/infrastructure/dto";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { HistoryEntryDto, QuoteRequestDto } from "../dto";

// The slice of the mock store the authorization touches. These are the SAME arrays every handler in the transport chain
// reads: they are only ever mutated in place, never reassigned.
export interface AuthorizePaymentStore {
  projects: ProjectDto[];
  externalProjects: ProjectDto[];
  milestones: MilestoneDetailDto[];
  paymentAuthorizations: PaymentAuthorizationDto[];
}

interface AuthorizePaymentIds {
  authorizationId: string;
  historyId: string;
  at: string;
}

// Executes the payment authorization of an agreed PROJECT negotiation. Synchronous on purpose: every guard has already
// passed, so the whole effect (negotiation, authorization, project status, first milestone) lands together or not at all.
// No money moves and no custody balance changes: the grant is capped at the agreed total and the funds stay in the buyer wallet.
export function applyProjectPaymentAuthorization(
  store: AuthorizePaymentStore,
  request: QuoteRequestDto,
  { authorizationId, historyId, at }: AuthorizePaymentIds,
): void {
  const total = request.agreed_total ?? 0;
  const project = [...store.projects, ...store.externalProjects].find((p) => p.id === request.project_id);
  if (!project) throw new Error(`Project ${request.project_id} not found`);

  request.authorization_status = "AUTHORIZED";
  request.authorized_at = at;
  request.payment_authorization_id = authorizationId;
  const entry: HistoryEntryDto = {
    id: historyId,
    actor: "BUYER",
    type: "AUTHORIZE_PAYMENT",
    from: request.status,
    to: request.status,
    at,
    payload: { cap: total, currency: "COP", authorization_id: authorizationId },
  };
  request.history.push(entry);

  store.paymentAuthorizations.push({
    id: authorizationId,
    negotiation_id: request.id,
    project_id: project.id,
    buyer_id: request.buyer_id,
    cap: total,
    spent: 0,
    currency: "COP",
    status: "AUTHORIZED",
    created_at: at,
    revoked_at: null,
  });

  // The project is approved for execution (wire value kept); the first milestone is released, the rest stay as they are.
  project.current_status = "FUNDED_IN_CUSTODY";
  const first = store.milestones.find((m) => m.project_id === project.id && m.sequence_order === 1);
  if (first && first.status === "LOCKED") first.status = "ACTIVE";
}
