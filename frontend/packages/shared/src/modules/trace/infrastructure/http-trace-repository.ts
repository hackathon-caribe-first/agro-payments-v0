import { toGrantDetail, toInvestorGrants } from "../../grants/infrastructure/mapper";
import { toSettlements } from "../../harvest-batches/infrastructure/mapper";
import { JsonReader } from "../../panel/infrastructure/json-reader";
import type { TraceRepository, TraceSources } from "../application/trace-repository";

interface Options {
  baseUrl?: string;
  fetchFn: typeof fetch;
  // Investors whose grants are traced (the platform has no "all grants" listing yet).
  investorIds: readonly string[];
}

const enc = encodeURIComponent;

export class HttpTraceRepository implements TraceRepository {
  private readonly reader: JsonReader;
  private readonly investorIds: readonly string[];

  constructor({ baseUrl, fetchFn, investorIds }: Options) {
    this.reader = new JsonReader({ baseUrl, fetchFn });
    this.investorIds = investorIds;
  }

  async loadSources(): Promise<TraceSources> {
    const lists = await Promise.all(this.investorIds.map((id) => this.reader.getOptional(`/investors/${enc(id)}/grants`)));
    const grantIds = lists.flatMap((raw) => (raw ? toInvestorGrants(raw).grants.map((v) => v.grant.id) : []));
    const [details, settlementsRaw] = await Promise.all([
      Promise.all(grantIds.map((id) => this.reader.getOptional(`/grants/${enc(id)}`))),
      this.reader.getOptional("/settlements"),
    ]);
    return {
      grants: details.flatMap((raw) => (raw ? [toGrantDetail(raw)] : [])),
      settlements: settlementsRaw ? toSettlements(settlementsRaw) : [],
    };
  }
}
