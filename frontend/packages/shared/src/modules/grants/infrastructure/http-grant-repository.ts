import { FORM_LEVEL_KEY, NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { GrantRepository, GrantRequestTarget } from "../application/grant-repository";
import type { RevocationReason, WalletConsent } from "../domain/grant";
import { GRANT_CONFLICT_CODES, GrantConflict, type GrantConflictCode } from "../domain/errors";
import type { SpendInput } from "../schemas/grant-inputs";
import { conflictBodyDtoSchema } from "./dto";
import { toGrant, toGrantDetail, toInvestorGrants, toProjectGrants, toSpendResult, toWalletConsent } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

export class HttpGrantRepository implements GrantRepository {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl, fetchFn }: Options) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
  }

  // 400 = invalid input (field errors); 409 = business rule, carried with its code (GRANT_LIMIT_EXCEEDED, ...).
  private async json(response: Response): Promise<unknown> {
    if (response.status === 400) throw new ValidationFailure(await readFieldErrors(response));
    if (response.status === 409) {
      const parsed = conflictBodyDtoSchema.safeParse(await response.json().catch(() => null));
      const body = parsed.success ? parsed.data : { error: undefined, errors: {}, remaining: undefined };
      const code: GrantConflictCode = (GRANT_CONFLICT_CODES as readonly string[]).includes(body.error ?? "") ? (body.error as GrantConflictCode) : "UNKNOWN";
      throw new GrantConflict(code, body.errors[FORM_LEVEL_KEY]?.join(" ") ?? "", body.remaining ?? null);
    }
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  private post(path: string, body?: unknown) {
    return this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async listInvestorGrants(investorId: string) {
    return toInvestorGrants(await this.json(await this.request(`/investors/${enc(investorId)}/grants`)));
  }

  // Without an investor the endpoint answers with every grant of the project (read-only producer view).
  async getProjectGrants(projectId: string, investorId?: string) {
    const query = investorId ? `?investor_id=${enc(investorId)}` : "";
    const response = await this.request(`/projects/${enc(projectId)}/grants${query}`);
    if (response.status === 404) return null;
    return toProjectGrants(await this.json(response));
  }

  async getGrantDetail(grantId: string) {
    const response = await this.request(`/grants/${enc(grantId)}`);
    if (response.status === 404) return null;
    return toGrantDetail(await this.json(response));
  }

  async requestGrant(projectId: string, target: GrantRequestTarget) {
    const response = await this.post(`/projects/${enc(projectId)}/grants`, {
      milestone_id: target.milestoneId,
      investor_id: target.investorId,
      wallet: target.wallet,
    });
    return toGrant(await this.json(response));
  }

  async consentInWallet(grantId: string, accountConfirmed: boolean) {
    const response = await this.post(`/grants/${enc(grantId)}/interact`, { account_confirmed: accountConfirmed });
    return toWalletConsent(await this.json(response));
  }

  async continueGrant(grantId: string, consent: WalletConsent) {
    const response = await this.post(`/grants/${enc(grantId)}/continue`, { interact_ref: consent.interactRef, hash: consent.hash });
    return toGrant(await this.json(response));
  }

  async denyGrant(grantId: string) {
    return toGrant(await this.json(await this.post(`/grants/${enc(grantId)}/deny`)));
  }

  async rotateToken(grantId: string) {
    return toGrant(await this.json(await this.post(`/grants/${enc(grantId)}/rotate-token`)));
  }

  async revokeGrant(grantId: string, reason: Exclude<RevocationReason, "UNKNOWN">) {
    return toGrant(await this.json(await this.post(`/grants/${enc(grantId)}/revoke`, { reason })));
  }

  async spend(grantId: string, input: SpendInput) {
    const response = await this.post(`/grants/${enc(grantId)}/spend`, {
      line_id: input.lineId,
      concept: input.concept,
      beneficiary: input.beneficiary,
      beneficiary_wallet: input.beneficiaryWallet,
      received: input.received,
      ...(input.fee !== undefined ? { fee: input.fee } : {}),
    });
    return toSpendResult(await this.json(response));
  }
}
