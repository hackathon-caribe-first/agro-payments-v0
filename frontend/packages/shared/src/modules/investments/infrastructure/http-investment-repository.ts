import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { InvestmentRepository } from "../application/investment-repository";
import type { InvestInput } from "../schemas/invest";
import { toInvestment, toInvestments, toInvestorProject, toInvestorProjects } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

export class HttpInvestmentRepository implements InvestmentRepository {
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

  // 400 (invalid input) and 409 (business refusal) share one body shape and both surface as field/form errors.
  private async json(response: Response): Promise<unknown> {
    if (response.status === 400 || response.status === 409) throw new ValidationFailure(await readFieldErrors(response));
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  async listFundable() {
    return toInvestorProjects(await this.json(await this.request("/investor/projects")));
  }

  async getProject(projectId: string) {
    const response = await this.request(`/investor/projects/${enc(projectId)}`);
    if (response.status === 404) return null;
    return toInvestorProject(await this.json(response));
  }

  async listInvestments(projectId: string) {
    return toInvestments(await this.json(await this.request(`/projects/${enc(projectId)}/investments`)));
  }

  async invest(projectId: string, input: InvestInput) {
    const response = await this.request(`/projects/${enc(projectId)}/investments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: input.amount, wallet_address: input.wallet_address }),
    });
    return toInvestment(await this.json(response));
  }
}
