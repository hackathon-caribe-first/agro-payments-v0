import { FORM_LEVEL_KEY, NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { rejectionBodySchema } from "../../projects/infrastructure/dto";
import { Rejection, type SimulationRepository } from "../application/simulation-repository";
import type { RunSimulationInput } from "../domain/sheet";
import { toPresets, toSheet } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

async function fail(response: Response): Promise<never> {
  const body = rejectionBodySchema.safeParse(await response.json().catch(() => null));
  const errors = body.success ? body.data.errors : {};
  if (response.status === 400) throw new ValidationFailure(Object.keys(errors).length > 0 ? errors : { [FORM_LEVEL_KEY]: ["El servidor rechazó los datos."] });
  if (response.status === 409) throw new Rejection(errors[FORM_LEVEL_KEY]?.[0] ?? (body.success ? body.data.error : undefined) ?? "El servidor rechazó la acción.");
  throw new NetworkError(`Unexpected response ${response.status}`, response.status);
}

export class HttpSimulationRepository implements SimulationRepository {
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

  private project(projectId: string, rest: string) {
    return `/projects/${encodeURIComponent(projectId)}/${rest}`;
  }

  async listPresets() {
    const response = await this.request("/simulation/presets");
    if (!response.ok) return fail(response);
    return toPresets(await response.json());
  }

  async getLatest(projectId: string) {
    const response = await this.request(this.project(projectId, "simulation"));
    if (response.status === 404) return null;
    if (!response.ok) return fail(response);
    return toSheet(await response.json());
  }

  async run(projectId: string, input: RunSimulationInput) {
    const body = { preset: input.preset, ...(input.contractPricePerKg === undefined ? {} : { contract_price_per_kg: input.contractPricePerKg }) };
    const response = await this.request(this.project(projectId, "simulation"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return fail(response);
    return toSheet(await response.json());
  }

  async publish(projectId: string) {
    const response = await this.request(this.project(projectId, "publish"), { method: "POST" });
    if (!response.ok) return fail(response);
  }
}
