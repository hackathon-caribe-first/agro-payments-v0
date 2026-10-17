import type { GrantDetail } from "../../grants/domain/grant";
import type { Settlement } from "../../harvest-batches/domain/harvest";

export interface TraceSources {
  grants: GrantDetail[];
  settlements: Settlement[];
}

// Port of the data the trace is derived from. It only reads.
export interface TraceRepository {
  loadSources(): Promise<TraceSources>;
}
