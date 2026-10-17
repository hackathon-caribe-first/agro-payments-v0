import { jsonRequest } from "~/platform/json-request";

/** RF-02/RF-03: the project's latest admission (nine filters with evidence, A15 score → level). */
export type Admission = {
  id: string;
  admitted: boolean;
  failed_filters: string[];
  score: number;
  level: "A" | "B" | "C" | "primer_ciclo";
  milestones: number | null;
  milestone_range: { min: number; max: number } | null;
  financeable_pct: { min: number | null; max: number } | null;
  labor_line: boolean;
  filters: { name: string; passes: boolean; evidence: string }[];
  created_at: string;
};

/** null when the project has not been assessed yet (404) or the server is not reachable (mock transport). */
export async function loadAdmission(projectId: string): Promise<Admission | null> {
  const result = await jsonRequest<Admission>(`/projects/${encodeURIComponent(projectId)}/admission`);
  return result.ok ? result.value : null;
}
