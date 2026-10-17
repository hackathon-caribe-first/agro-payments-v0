import { jsonRequest } from "~/platform/json-request";

/** RF-28: one Open Payments request as the backend recorded it (tokens already trimmed server side). */
export type OpTrace = {
  id: string;
  method: string;
  url: string;
  status: number | null;
  duration_ms: number;
  request_body: unknown;
  response_summary: string | null;
  error: string | null;
  curl: string;
  project_id: string | null;
  milestone_id: string | null;
  negotiation_id: string | null;
  investment_id: string | null;
  settlement_id: string | null;
  created_at: string;
};

export const loadTraces = (projectId: string | null, limit = 100) => {
  const query = new URLSearchParams({ limit: String(limit), ...(projectId && { project_id: projectId }) });
  return jsonRequest<OpTrace[]>(`/support/traces?${query}`);
};
