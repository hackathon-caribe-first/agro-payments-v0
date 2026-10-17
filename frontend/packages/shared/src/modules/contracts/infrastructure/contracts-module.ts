import type { z } from "zod";
import { BoundaryError, err, FORM_LEVEL_KEY, type FieldErrors, NetworkError, ok, type Result, ValidationFailure } from "../../milestones/domain/errors";
import { rejectionBodySchema } from "../../projects/infrastructure/dto";
import { Rejection } from "../../simulation/application/simulation-repository";
import type {
  ClaimInput,
  ContractDocument,
  InsuranceClaim,
  InsurancePolicy,
  PartyRole,
  PolicyInput,
  PurchaseContract,
  PurchaseContractInput,
} from "../domain/contracts";
import { type ClaimDto, claimDtoSchema, type ContractDto, contractDtoSchema, type PolicyDto, policyDtoSchema, type PurchaseContractDto, purchaseContractDtoSchema } from "./dto";

export type ContractsError =
  | { kind: "rejected"; message: string }
  | { kind: "validation"; fieldErrors: FieldErrors }
  | { kind: "boundary"; message: string }
  | { kind: "network"; message: string };

function toError(cause: unknown): ContractsError {
  if (cause instanceof Rejection) return { kind: "rejected", message: cause.message };
  if (cause instanceof ValidationFailure) return { kind: "validation", fieldErrors: cause.fieldErrors };
  if (cause instanceof BoundaryError) return { kind: "boundary", message: cause.message };
  return { kind: "network", message: cause instanceof Error ? cause.message : "Unexpected failure" };
}

async function attempt<T>(work: () => Promise<T>): Promise<Result<T, ContractsError>> {
  try {
    return ok(await work());
  } catch (cause) {
    return err(toError(cause));
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new BoundaryError(`Invalid ${what}: ${result.error.issues[0]?.path.join(".") ?? ""}`);
  return result.data;
}

const known = <K extends string>(raw: string, values: readonly K[]): K | "UNKNOWN" => ((values as readonly string[]).includes(raw) ? (raw as K) : "UNKNOWN");

const toPurchase = (d: PurchaseContractDto): PurchaseContract => ({
  projectId: d.project_id,
  priceType: d.price_type === "formula" ? "formula" : "fixed",
  pricePerUnit: d.price_per_unit,
  floorPerUnit: d.floor_per_unit,
  ceilingPerUnit: d.ceiling_per_unit,
  priceReference: d.price_reference,
  quantity: d.quantity,
  unit: d.unit === "t" ? "t" : "kg",
  currency: d.currency === "USD" ? "USD" : "COP",
  settles: d.settles,
  buyerName: d.buyer_name,
  buyerEmail: d.buyer_email,
  buyerWalletAddress: d.buyer_wallet_address,
  updatedAt: d.updated_at,
});

const toPolicy = (d: PolicyDto): InsurancePolicy => ({
  projectId: d.project_id,
  insurerName: d.insurer_name,
  insurerWalletAddress: d.insurer_wallet_address,
  beneficiary: d.beneficiary,
  source: known(d.source, ["simulation", "input"] as const),
  premium: d.premium,
  subsidyPct: d.subsidy_pct,
  netPremium: d.net_premium,
  thresholdPct: d.threshold_pct,
  thresholdYieldKgPerHa: d.threshold_yield_kg_per_ha,
  deductiblePct: d.deductible_pct,
  hectares: d.hectares,
  expectedYieldKgPerHa: d.expected_yield_kg_per_ha,
  insuredPricePerKg: d.insured_price_per_kg,
  sumInsured: d.sum_insured,
  indexTrigger: d.index_trigger,
  indexExit: d.index_exit,
  premiumPayment: d.premium_payment && {
    id: d.premium_payment.id,
    amount: d.premium_payment.amount,
    status: known(d.premium_payment.status, ["executing", "completed", "failed"] as const),
    reference: d.premium_payment.reference,
    outgoingPaymentId: d.premium_payment.outgoing_payment_id,
    requestedAt: d.premium_payment.requested_at,
    completedAt: d.premium_payment.completed_at,
  },
});

const toClaim = (d: ClaimDto): InsuranceClaim => ({
  id: d.id,
  trigger: known(d.trigger, ["yield", "index"] as const),
  observedValue: d.observed_value,
  evidence: d.evidence,
  amount: d.amount,
  status: known(d.status, ["pending", "confirmed"] as const),
  incomingPaymentUrl: d.incoming_payment_url,
  createdAt: d.created_at,
  confirmedAt: d.confirmed_at,
});

const ROLES: readonly PartyRole[] = ["investor", "fiduciaria", "producer", "buyer"];
const isRole = (r: string): r is PartyRole => (ROLES as readonly string[]).includes(r);

const toContract = (d: ContractDto): ContractDocument => ({
  id: d.id,
  projectId: d.project_id,
  version: d.version,
  hash: d.hash,
  body: d.body,
  status: d.status === "signed" ? "signed" : "pending_signatures",
  parties: d.parties.filter((p) => isRole(p.role)).map((p) => ({ role: p.role as PartyRole, name: p.name, signed: p.signed })),
  signatures: d.signatures.filter((s) => isRole(s.party_role)).map((s) => ({ partyRole: s.party_role as PartyRole, signedAt: s.signed_at })),
  signableRoles: d.signable_roles.filter(isRole),
  createdAt: d.created_at,
});

const purchaseBody = (i: PurchaseContractInput) => ({
  price_type: i.priceType,
  price_per_unit: i.pricePerUnit,
  floor_per_unit: i.floorPerUnit,
  ceiling_per_unit: i.ceilingPerUnit,
  price_reference: i.priceReference,
  quantity: i.quantity,
  unit: i.unit,
  currency: i.currency,
  buyer_email: i.buyerEmail,
  buyer_wallet_address: i.buyerWalletAddress,
});

const policyBody = (i: PolicyInput) => ({
  insurer_name: i.insurerName,
  insurer_wallet_address: i.insurerWalletAddress,
  premium: i.premium,
  subsidy_pct: i.subsidyPct,
  threshold_pct: i.thresholdPct,
  deductible_pct: i.deductiblePct,
  hectares: i.hectares,
  expected_yield_kg_per_ha: i.expectedYieldKgPerHa,
  insured_price_per_kg: i.insuredPricePerKg,
  index_trigger: i.indexTrigger,
  index_exit: i.indexExit,
});

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

// Composition root of the contracts and insurance screens (http transport or the app mock, whichever fetchFn is).
export function createContractsModule({ fetchFn, baseUrl = "/api" }: Options) {
  const base = baseUrl.replace(/\/$/, "");

  async function request(method: string, path: string, body?: unknown): Promise<Response | null> {
    let response: Response;
    try {
      response = await fetchFn(`${base}${path}`, {
        method,
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
    if (response.ok) return response;
    if (response.status === 404 && method === "GET") return null;
    const parsed = rejectionBodySchema.safeParse(await response.json().catch(() => null));
    const errors = parsed.success ? parsed.data.errors : {};
    if (response.status === 400) throw new ValidationFailure(Object.keys(errors).length > 0 ? errors : { [FORM_LEVEL_KEY]: ["El servidor rechazó los datos."] });
    if (response.status === 409) throw new Rejection(errors[FORM_LEVEL_KEY]?.[0] ?? (parsed.success ? parsed.data.error : undefined) ?? "El servidor rechazó la acción.");
    throw new NetworkError(`Unexpected response ${response.status}`, response.status);
  }

  const call = <S extends z.ZodTypeAny, T>(schema: S, map: (dto: z.infer<S>) => T, what: string) => async (method: string, path: string, body?: unknown) => {
    const response = await request(method, path, body);
    return response ? map(parse(schema, await response.json(), what)) : null;
  };
  const project = (id: string, rest: string) => `/projects/${encodeURIComponent(id)}/${rest}`;
  const purchase = call(purchaseContractDtoSchema, toPurchase, "purchase contract");
  const policy = call(policyDtoSchema, toPolicy, "insurance policy");
  const claim = call(claimDtoSchema, toClaim, "claim");
  const contract = call(contractDtoSchema, toContract, "contract");
  const must = <T>(value: T | null): T => {
    if (value === null) throw new NetworkError("Unexpected 404");
    return value;
  };

  return {
    getPurchaseContract: (id: string) => attempt(() => purchase("GET", project(id, "purchase-contract"))),
    savePurchaseContract: (id: string, input: PurchaseContractInput) => attempt(async () => must(await purchase("PUT", project(id, "purchase-contract"), purchaseBody(input)))),
    getPolicy: (id: string) => attempt(() => policy("GET", project(id, "insurance-policy"))),
    savePolicy: (id: string, input: PolicyInput) => attempt(async () => must(await policy("PUT", project(id, "insurance-policy"), policyBody(input)))),
    startPremiumGrant: (id: string) =>
      attempt(async () => {
        const response = must(await request("POST", project(id, "insurance-policy/premium-grant")));
        const body = (await response.json()) as { redirect_url?: unknown };
        return typeof body.redirect_url === "string" ? body.redirect_url : null;
      }),
    payPremium: (id: string) => attempt(async () => must(await policy("POST", project(id, "insurance-policy/pay-premium")))),
    listClaims: (id: string) =>
      attempt(async () => {
        const response = await request("GET", project(id, "insurance-policy/claims"));
        return response ? (parse(claimDtoSchema.array(), await response.json(), "claims") as ClaimDto[]).map(toClaim) : [];
      }),
    fileClaim: (id: string, input: ClaimInput) =>
      attempt(async () => must(await claim("POST", project(id, "insurance-policy/claims"), { trigger: input.trigger, observed_value: input.observedValue, evidence: input.evidence }))),
    confirmClaim: (id: string, claimId: string) => attempt(async () => must(await claim("POST", project(id, `insurance-policy/claims/${encodeURIComponent(claimId)}/confirm`)))),
    getContract: (id: string) => attempt(() => contract("GET", project(id, "contract"))),
    generateContract: (id: string) => attempt(async () => must(await contract("POST", project(id, "contract")))),
    sign: (contractId: string) => attempt(async () => must(await contract("POST", `/contracts/${encodeURIComponent(contractId)}/signatures`))),
  };
}

export type ContractsModule = ReturnType<typeof createContractsModule>;
