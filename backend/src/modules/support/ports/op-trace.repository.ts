import type { OpTrace } from "../application/op-trace";

export type OpTraceQuery = { projectId?: string; limit: number };

// Append-only RF-28 trace. Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class OpTraceRepository {
  abstract record(trace: OpTrace): Promise<void>;
  /** Newest first. */
  abstract list(query: OpTraceQuery): Promise<OpTrace[]>;
}
