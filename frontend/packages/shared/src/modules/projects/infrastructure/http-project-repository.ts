import { FORM_LEVEL_KEY, NetworkError, ValidationFailure, type FieldErrors } from "../../milestones/domain/errors";
import type { ProjectRepository } from "../application/project-repository";
import type { CreateProjectInput } from "../domain/project-draft";
import { rejectionBodySchema } from "./dto";
import { toCreateProjectRequestDto, toProject, toProjects } from "./mapper";

// Wire shape of a 400: { error: string, errors: { [fieldPath]: string[] } } (see rejectionBodySchema).
export async function readFieldErrors(response: Response): Promise<FieldErrors> {
  const parsed = rejectionBodySchema.safeParse(await response.json().catch(() => null));
  const fieldErrors = parsed.success ? parsed.data.errors : {};
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : { [FORM_LEVEL_KEY]: ["El servidor rechazó los datos del proyecto."] };
}

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

export class HttpProjectRepository implements ProjectRepository {
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

  async listProducerProjects() {
    const response = await this.request("/producer/projects");
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return toProjects(await response.json());
  }

  async getProject(projectId: string) {
    const response = await this.request(`/projects/${encodeURIComponent(projectId)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return toProject(await response.json());
  }

  async create(input: CreateProjectInput) {
    const response = await this.request("/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toCreateProjectRequestDto(input)),
    });
    if (response.status === 400) throw new ValidationFailure(await readFieldErrors(response));
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return toProject(await response.json());
  }
}
