import { FORM_LEVEL_KEY } from "../../../milestones/domain/errors";
import { toFieldErrors } from "../../../milestones/schemas/evidence-log";
import type { MilestoneDetailDto } from "../../../milestones/infrastructure/dto";
import { normalizeWalletUrl, walletProblem } from "../../../payment-lines/domain/supplier";
import { lookupWallet } from "../../../payment-lines/infrastructure/mock/wallet-registry";
import { projectTargetAmount } from "../../domain/project-draft";
import { createProjectInputSchema } from "../../schemas/create-project";
import { createProjectRequestDtoSchema, type CreateProjectRequestDto, type ProjectDto, type RejectionBody } from "../dto";
import type { ProducerMockStore } from "./store";

const PLATFORM_FEE_PCT = 2;
const CURRENCY = "COP";

const reject = (errors: RejectionBody["errors"]) => json({ error: "Invalid project payload", errors } satisfies RejectionBody, 400);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// The server re-validates with the same rules as the client: convert the wire shape back to the domain input.
const toDomainInput = (dto: CreateProjectRequestDto) => ({
  title: dto.title,
  description: dto.description,
  productionType: dto.production_type,
  startDate: dto.start_date,
  estimatedEndDate: dto.estimated_end_date,
  producerWalletAddress: dto.producer_wallet_address,
  contingencyBps: dto.contingency_bps,
  milestones: [...dto.milestones]
    .sort((a, b) => a.sequence_order - b.sequence_order)
    .map((m) => ({
      title: m.title,
      description: m.description,
      estimatedCompletionDate: m.estimated_completion_date,
      suppliesBudget: m.supplies_budget,
      laborBudget: m.labor_budget,
    })),
});

function nextIdentity(projects: ProjectDto[]) {
  const year = new Date().getFullYear();
  let n = projects.length + 1;
  while (projects.some((p) => p.id === `proj-${n}`)) n++;
  let seq = projects.filter((p) => p.project_code.startsWith(`AGR-${year}-`)).length + 1;
  while (projects.some((p) => p.project_code === `AGR-${year}-${String(seq).padStart(3, "0")}`)) seq++;
  return { id: `proj-${n}`, projectCode: `AGR-${year}-${String(seq).padStart(3, "0")}` };
}

function createProject(store: ProducerMockStore, dto: CreateProjectRequestDto): ProjectDto {
  const input = createProjectInputSchema.parse(toDomainInput(dto));
  const { id, projectCode } = nextIdentity(store.projects);

  const project: ProjectDto = {
    id,
    project_code: projectCode,
    title: input.title,
    production_type: input.productionType,
    description: input.description,
    target_amount: projectTargetAmount(input.milestones),
    custody_balance: 0,
    total_disbursed: 0,
    investor_roi_pct: 0,
    platform_fee_pct: PLATFORM_FEE_PCT,
    current_status: "DRAFT",
    start_date: input.startDate,
    estimated_end_date: input.estimatedEndDate,
    currency: CURRENCY,
    // RF-01 / RF-21: stored as validated by the endpoint; projects created without them keep working.
    ...(input.producerWalletAddress ? { producer_wallet_address: normalizeWalletUrl(input.producerWalletAddress) ?? input.producerWalletAddress } : {}),
    ...(input.contingencyBps !== undefined ? { contingency_bps: input.contingencyBps } : {}),
  };

  const milestones: MilestoneDetailDto[] = input.milestones.map((m, i) => ({
    id: `${id}-ms-${i + 1}`,
    project_id: id,
    sequence_order: i + 1,
    title: m.title,
    description: m.description,
    estimated_completion_date: m.estimatedCompletionDate,
    status: "LOCKED",
    supplies_budget: m.suppliesBudget,
    labor_budget: m.laborBudget,
    currency: CURRENCY,
    supplies_executed: 0,
    labor_executed: 0,
    required_evidences: [],
    evidence_logs: [],
    reviews: [],
  }));

  store.projects.push(project);
  store.milestones.push(...milestones);
  return project;
}

// Serves the project routes from the shared in-memory store and delegates everything else (milestones) to `delegate`.
export function createProjectsMockFetch(store: ProducerMockStore, delegate: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    if (method === "GET" && path === "/producer/projects") return json(store.projects);

    if (method === "POST" && path === "/projects") {
      let body: unknown;
      try {
        body = JSON.parse(String(init?.body ?? "null"));
      } catch {
        return reject({ [FORM_LEVEL_KEY]: ["El cuerpo de la solicitud no es JSON válido."] });
      }
      const dto = createProjectRequestDtoSchema.safeParse(body);
      if (!dto.success) return reject({ [FORM_LEVEL_KEY]: ["La solicitud no tiene el formato esperado."] });
      const input = createProjectInputSchema.safeParse(toDomainInput(dto.data));
      if (!input.success) return reject(toFieldErrors(input.error));
      // The server validates the wallet again (RF-01): never trust the client's earlier check.
      if (input.data.producerWalletAddress) {
        const lookup = lookupWallet(input.data.producerWalletAddress);
        const problem = lookup.kind === "invalid" ? lookup.message : walletProblem(lookup.validation);
        if (problem) return reject({ producerWalletAddress: [problem] });
      }
      return json(createProject(store, dto.data), 201);
    }

    const detail = path.match(/^\/projects\/([^/]+)$/);
    if (method === "GET" && detail) {
      const project = store.projects.find((p) => p.id === detail[1]);
      return project ? json(project) : json({ error: "Project not found" }, 404);
    }

    return delegate(input, init);
  };
}
