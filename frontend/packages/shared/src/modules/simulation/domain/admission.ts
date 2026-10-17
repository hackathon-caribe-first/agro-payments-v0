// RF-02/RF-03: Fase 0 admission. The nine elimination filters (binary, each with evidence) and the seven A15 blocks
// (X_m ∈ [0, 100]) the backend motor weighs 20/20/20/15/10/10/5. Order matters: the wire sends filters as an array.

export const ELIMINATION_FILTERS = [
  "Listas restrictivas",
  "Mora mayor de 60 días o con el FAG",
  "Lote en páramo o área protegida",
  "Deforestación posterior a 2020",
  "Sin derecho documentado al predio",
  "Aptitud UPRA nula",
  "Sin agua",
  "Cultivo ilícito o trabajo infantil",
  "Sin forma de reportar avances",
] as const;

export const ADMISSION_BLOCK = {
  COMERCIAL: "comercial",
  CAPACIDAD_PAGO: "capacidad_pago",
  TECNICO: "tecnico",
  HISTORIAL: "historial",
  TENENCIA: "tenencia",
  CLIMA: "clima",
  ASOCIATIVIDAD: "asociatividad",
} as const;

export type AdmissionBlock = (typeof ADMISSION_BLOCK)[keyof typeof ADMISSION_BLOCK];

export interface AdmissionBlockSpec {
  key: AdmissionBlock;
  label: string;
  weight: number;
}

/** In the motor's weight order. */
export const ADMISSION_BLOCKS: readonly AdmissionBlockSpec[] = [
  { key: ADMISSION_BLOCK.COMERCIAL, label: "Comercial (comprador y precio)", weight: 20 },
  { key: ADMISSION_BLOCK.CAPACIDAD_PAGO, label: "Capacidad de pago", weight: 20 },
  { key: ADMISSION_BLOCK.TECNICO, label: "Técnico (paquete y asistencia)", weight: 20 },
  { key: ADMISSION_BLOCK.HISTORIAL, label: "Historial productivo y crediticio", weight: 15 },
  { key: ADMISSION_BLOCK.TENENCIA, label: "Tenencia del predio", weight: 10 },
  { key: ADMISSION_BLOCK.CLIMA, label: "Riesgo climático", weight: 10 },
  { key: ADMISSION_BLOCK.ASOCIATIVIDAD, label: "Asociatividad", weight: 5 },
];

export const EVIDENCE_MAX_LENGTH = 500;

export interface FilterAnswer {
  passes: boolean;
  evidence: string;
}

/** Body of POST /api/projects/:id/admission. */
export interface AdmissionRequest {
  filters: FilterAnswer[];
  blocks: Record<AdmissionBlock, number>;
}

export const ADMISSION_LEVEL = { A: "A", B: "B", C: "C", FIRST_CYCLE: "primer_ciclo" } as const;
export type AdmissionLevel = (typeof ADMISSION_LEVEL)[keyof typeof ADMISSION_LEVEL];

export interface MilestoneRange {
  min: number;
  max: number;
}

export interface FinanceablePct {
  min: number | null;
  max: number;
}

export interface AssessedFilter extends FilterAnswer {
  name: string;
}

/** Wire shape (snake_case) of GET/POST /api/projects/:id/admission. */
export interface AdmissionResponse {
  id: string;
  project_id: string;
  admitted: boolean;
  failed_filters: string[];
  score: number;
  level: AdmissionLevel;
  /** Minimum of the level's milestone range; null in primer ciclo (paid in kind). */
  milestones: number | null;
  milestone_range: MilestoneRange | null;
  /** null in primer ciclo: «monto pequeño, en grupo». */
  financeable_pct: FinanceablePct | null;
  /** Jornales line: only levels A and B. */
  labor_line: boolean;
  filters: AssessedFilter[];
  blocks: Record<AdmissionBlock, number>;
  motor_version: string;
  created_by: string;
  created_at: string;
}
