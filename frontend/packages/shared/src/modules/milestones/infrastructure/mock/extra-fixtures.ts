import type { MilestoneStatus } from "../../domain/milestone";
import type { MilestoneDetailDto } from "../dto";

// Milestones of the other producer projects. Kept compact: each one asks for an area and two photos.

interface Spec {
  id: string;
  projectId: string;
  order: number;
  title: string;
  description: string;
  status: MilestoneStatus;
  supplies: number;
  labor: number;
  estimated?: string;
}

const PHOTOS = [
  "https://fotos.surco.co/proyectos/lote-01.jpg",
  "https://fotos.surco.co/proyectos/lote-02.jpg",
];

const PAID: MilestoneStatus[] = ["COMPLETED_AND_PAID"];
const APPROVED: MilestoneStatus[] = ["COMPLETED_AND_PAID", "TECHNICALLY_APPROVED"];

function build(spec: Spec): MilestoneDetailDto {
  const hasEvidence = APPROVED.includes(spec.status);
  const paid = PAID.includes(spec.status);
  const day = String(spec.order).padStart(2, "0");
  return {
    id: spec.id,
    project_id: spec.projectId,
    sequence_order: spec.order,
    title: spec.title,
    description: spec.description,
    status: spec.status,
    supplies_budget: spec.supplies,
    labor_budget: spec.labor,
    ...(spec.estimated ? { estimated_completion_date: spec.estimated } : {}),
    currency: "COP",
    supplies_executed: hasEvidence ? spec.supplies : 0,
    labor_executed: paid ? spec.labor : 0,
    required_evidences: [
      { field_key: "area_ha", label: "Área intervenida (ha)", type: "number", min: 0.5, max: 50 },
      { field_key: "field_photos", label: "Fotos del lote", type: "photo_array", min_items: 2 },
    ],
    evidence_logs: hasEvidence
      ? [
          {
            id: `${spec.id}-log`,
            milestone_id: spec.id,
            log_type: "PHOTO_EVIDENCE",
            notes: "Labor terminada en el lote.",
            evidence_payload: { area_ha: 4, field_photos: PHOTOS },
            created_at: `2026-0${(spec.order % 6) + 1}-${day}T10:00:00Z`,
          },
        ]
      : [],
    reviews: hasEvidence
      ? [
          { id: `${spec.id}-r1`, verdict: "SUBMITTED", comment: null, created_at: "2026-02-10T10:00:00Z" },
          { id: `${spec.id}-r2`, verdict: "APPROVED_FAVORABLE", comment: "Evidencia completa y consistente.", created_at: "2026-02-12T10:00:00Z" },
          ...(paid ? [{ id: `${spec.id}-r3`, verdict: "PAYOUT_EXECUTED" as const, comment: null, created_at: "2026-02-14T10:00:00Z" }] : []),
        ]
      : [],
  };
}

const CACAO = "proj-cacao-arauca";
const AGUACATE = "proj-aguacate-tolima";
const PANELA = "proj-panela-cundinamarca";
const PLATANO = "proj-platano-meta";
const LIMON = "proj-limon-valle";
const SIERRA = "ext-sierra-cafe";
const TOLIMA = "ext-tolima-cacao";

const SPECS = [
  { id: "ms-11", projectId: CACAO, order: 1, title: "Preparación del lote", description: "Limpieza y trazado del lote de cacao.", status: "LOCKED", supplies: 4000000, labor: 2500000, estimated: "2027-01-15" },
  { id: "ms-12", projectId: CACAO, order: 2, title: "Siembra de clones", description: "Siembra de clones de cacao fino de aroma.", status: "LOCKED", supplies: 9000000, labor: 3500000, estimated: "2027-04-30" },
  { id: "ms-13", projectId: CACAO, order: 3, title: "Sombrío y fertilización", description: "Establecimiento de sombrío temporal y primera fertilización.", status: "LOCKED", supplies: 6000000, labor: 2800000, estimated: "2027-08-15" },
  { id: "ms-ext-s1", projectId: SIERRA, order: 1, title: "Preparación del beneficiadero", description: "Adecuación de tanques y patios de secado.", status: "LOCKED", supplies: 5000000, labor: 3000000, estimated: "2026-12-15" },
  { id: "ms-ext-s2", projectId: SIERRA, order: 2, title: "Cosecha selectiva", description: "Recolección selectiva de cereza madura.", status: "LOCKED", supplies: 6000000, labor: 4000000, estimated: "2027-02-15" },
  { id: "ms-ext-s3", projectId: SIERRA, order: 3, title: "Secado y trillado", description: "Secado en patio y trillado del café pergamino.", status: "LOCKED", supplies: 3500000, labor: 2500000, estimated: "2027-03-20" },
  { id: "ms-ext-t1", projectId: TOLIMA, order: 1, title: "Fermentadero y cajones", description: "Construcción de cajones de fermentación.", status: "LOCKED", supplies: 4000000, labor: 2000000, estimated: "2026-12-20" },
  { id: "ms-ext-t2", projectId: TOLIMA, order: 2, title: "Secado controlado", description: "Secado del grano en marquesinas.", status: "LOCKED", supplies: 5000000, labor: 3000000, estimated: "2027-02-10" },
  { id: "ms-21", projectId: AGUACATE, order: 1, title: "Preparación y hoyado", description: "Trazado y hoyado del lote de aguacate.", status: "COMPLETED_AND_PAID", supplies: 3500000, labor: 2200000 },
  { id: "ms-22", projectId: AGUACATE, order: 2, title: "Siembra de plántulas Hass", description: "Siembra de plántulas injertadas.", status: "COMPLETED_AND_PAID", supplies: 8500000, labor: 3000000 },
  { id: "ms-23", projectId: AGUACATE, order: 3, title: "Cosecha y entrega", description: "Cosecha selectiva y entrega al comprador.", status: "COMPLETED_AND_PAID", supplies: 2800000, labor: 4000000 },
  { id: "ms-31", projectId: PANELA, order: 1, title: "Renovación del cultivo", description: "Corte y resiembra de caña panelera.", status: "COMPLETED_AND_PAID", supplies: 4200000, labor: 2600000 },
  { id: "ms-32", projectId: PANELA, order: 2, title: "Fertilización orgánica", description: "Aplicación de abono orgánico en el cultivo.", status: "COMPLETED_AND_PAID", supplies: 3600000, labor: 1800000 },
  { id: "ms-33", projectId: PANELA, order: 3, title: "Corte y molienda", description: "Corte de caña y molienda en trapiche.", status: "TECHNICALLY_APPROVED", supplies: 2200000, labor: 5100000 },
  { id: "ms-51", projectId: LIMON, order: 1, title: "Preparación del lote y riego", description: "Limpieza del lote e instalación del riego por goteo.", status: "LOCKED", supplies: 5500000, labor: 2500000, estimated: "2027-01-31" },
  { id: "ms-52", projectId: LIMON, order: 2, title: "Renovación de árboles", description: "Poda de renovación y fertilización de los árboles.", status: "LOCKED", supplies: 4500000, labor: 2500000, estimated: "2027-05-15" },
  { id: "ms-41", projectId: PLATANO, order: 1, title: "Adecuación del terreno", description: "Drenajes y trazado del lote de plátano.", status: "ACTIVE", supplies: 3800000, labor: 2000000 },
  { id: "ms-42", projectId: PLATANO, order: 2, title: "Siembra de cormos", description: "Siembra de cormos de plátano Hartón.", status: "LOCKED", supplies: 7200000, labor: 2900000 },
  { id: "ms-43", projectId: PLATANO, order: 3, title: "Manejo de plagas", description: "Control fitosanitario del cultivo.", status: "LOCKED", supplies: 4500000, labor: 3600000 },
] satisfies Spec[];

export const EXTRA_MILESTONES: MilestoneDetailDto[] = SPECS.map(build);
