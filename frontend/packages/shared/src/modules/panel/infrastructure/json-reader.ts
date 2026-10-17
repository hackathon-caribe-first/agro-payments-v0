import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const DEFAULT_BASE_URL = "/api";

// Minimal JSON client over an injectable fetch, shared by the read-mostly operations modules.
// `get` answers null on 404 so an optional resource never aborts a whole aggregation.
export class JsonReader {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl = DEFAULT_BASE_URL, fetchFn }: Partial<Options> & Pick<Options, "fetchFn">) {
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

  async get(path: string): Promise<unknown | null> {
    const response = await this.request(path);
    if (response.status === 404) return null;
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  // Same as `get`, but a failure of an optional source degrades to null instead of throwing.
  async getOptional(path: string): Promise<unknown | null> {
    try {
      return await this.get(path);
    } catch {
      return null;
    }
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    const response = await this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 400 || response.status === 409) throw new ValidationFailure(await readFieldErrors(response));
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }
}
