import { JsonReader } from "../../panel/infrastructure/json-reader";
import type { ReconciliationRepository } from "../application/reconciliation-repository";
import { toEntries, toEntry } from "./mapper";

interface Options {
  baseUrl?: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

export class HttpReconciliationRepository implements ReconciliationRepository {
  private readonly reader: JsonReader;

  constructor({ baseUrl, fetchFn }: Options) {
    this.reader = new JsonReader({ baseUrl, fetchFn });
  }

  async listEntries() {
    return toEntries((await this.reader.get("/reconciliation/entries")) ?? []);
  }

  async reviewEntry(entryId: string, note: string, actor: string) {
    try {
      return toEntry(await this.reader.post(`/reconciliation/entries/${enc(entryId)}/reviews`, { note, actor }));
    } catch (cause) {
      // The reader maps 404 to a NetworkError(status 404): an unknown row is "not found", not a transport fault.
      if (cause instanceof Error && "status" in cause && (cause as { status?: number }).status === 404) return null;
      throw cause;
    }
  }
}
