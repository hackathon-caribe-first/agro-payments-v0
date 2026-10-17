import type { MilestoneDetailDto } from "../dto";
import { EXTRA_MILESTONES } from "./extra-fixtures";

export const FIXTURE_PROJECT_ID = "proj-finca-la-esperanza";

// Photos a producer can attach to a field log (no upload in this slice).
export const FIXTURE_PHOTO_URLS = [
  "https://fotos.surco.co/finca-la-esperanza/lote-norte-01.jpg",
  "https://fotos.surco.co/finca-la-esperanza/lote-norte-02.jpg",
  "https://fotos.surco.co/finca-la-esperanza/lote-norte-03.jpg",
  "https://fotos.surco.co/finca-la-esperanza/lote-sur-01.jpg",
  "https://fotos.surco.co/finca-la-esperanza/lote-sur-02.jpg",
  "https://fotos.surco.co/finca-la-esperanza/lote-sur-03.jpg",
];

const [N1, N2, N3, S1, S2] = FIXTURE_PHOTO_URLS;

const base = { project_id: FIXTURE_PROJECT_ID, currency: "COP" } as const;

const FIXTURE_MILESTONES: MilestoneDetailDto[] = [
  {
    ...base,
    id: "ms-01",
    sequence_order: 1,
    title: "Preparación del terreno",
    description: "Limpieza, análisis de suelo y trazado del lote norte para café variedad Castillo.",
    status: "SUBMITTED_FOR_REVIEW",
    supplies_budget: 3200000,
    labor_budget: 1800000,
    supplies_executed: 3200000,
    labor_executed: 0,
    required_evidences: [
      { field_key: "soil_ph", label: "pH del suelo", type: "number", min: 4.5, max: 7 },
      { field_key: "terrain_cleared", label: "Terreno despejado y trazado", type: "boolean_system_check" },
      { field_key: "field_photos", label: "Fotos del lote", type: "photo_array", min_items: 3 },
    ],
    evidence_logs: [
      {
        id: "log-01",
        milestone_id: "ms-01",
        log_type: "SOIL_ANALYSIS",
        notes: "Muestra compuesta de cinco puntos del lote norte.",
        evidence_payload: { soil_ph: 5.6, terrain_cleared: true },
        created_at: "2026-08-04T14:20:00Z",
      },
      {
        id: "log-02",
        milestone_id: "ms-01",
        log_type: "PHOTO_EVIDENCE",
        notes: "Lote despejado y estacado.",
        evidence_payload: { field_photos: [N1, N2, N3] },
        created_at: "2026-08-05T09:10:00Z",
      },
    ],
    reviews: [
      { id: "rev-01", verdict: "SUBMITTED", comment: null, created_at: "2026-08-05T16:00:00Z" },
    ],
  },
  {
    ...base,
    id: "ms-02",
    sequence_order: 2,
    title: "Siembra de plántulas",
    description: "Siembra de 1.500 plántulas de café en el lote norte con espaciamiento de 1,5 metros.",
    status: "CHANGES_REQUESTED",
    supplies_budget: 4500000,
    labor_budget: 2400000,
    supplies_executed: 4500000,
    labor_executed: 0,
    required_evidences: [
      { field_key: "seedlings_planted", label: "Plántulas sembradas", type: "number", min: 1, max: 5000 },
      { field_key: "spacing_cm", label: "Espaciamiento entre plántulas (cm)", type: "number", min: 100, max: 200 },
      { field_key: "field_photos", label: "Fotos del lote sembrado", type: "photo_array", min_items: 2 },
    ],
    evidence_logs: [
      {
        id: "log-03",
        milestone_id: "ms-02",
        log_type: "PHOTO_EVIDENCE",
        notes: "Primera jornada de siembra.",
        evidence_payload: { seedlings_planted: 1500, field_photos: [S1] },
        created_at: "2026-08-20T11:30:00Z",
      },
    ],
    reviews: [
      { id: "rev-02", verdict: "SUBMITTED", comment: null, created_at: "2026-08-21T10:00:00Z" },
      {
        id: "rev-03",
        verdict: "CHANGES_REQUESTED",
        comment: "Las fotos no muestran el espaciado entre plántulas. Registra el espaciamiento y adjunta al menos dos fotos del lote completo.",
        created_at: "2026-08-23T15:45:00Z",
      },
    ],
  },
  {
    ...base,
    id: "ms-03",
    sequence_order: 3,
    title: "Fertilización inicial",
    description: "Aplicación de fertilizante de arranque al pie de cada plántula.",
    status: "IN_FIELD_EXECUTION",
    supplies_budget: 2800000,
    labor_budget: 1200000,
    supplies_executed: 2800000,
    labor_executed: 0,
    required_evidences: [
      { field_key: "fertilizer_kg", label: "Fertilizante aplicado (kg)", type: "number", min: 50, max: 500 },
      { field_key: "application_verified", label: "Aplicación verificada por el sistema", type: "boolean_system_check" },
      { field_key: "field_photos", label: "Fotos de la aplicación", type: "photo_array", min_items: 2 },
    ],
    evidence_logs: [
      {
        id: "log-04",
        milestone_id: "ms-03",
        log_type: "AGRONOMIC_NOTE",
        notes: "Primera pasada con 220 kg en el sector oriental.",
        evidence_payload: { fertilizer_kg: 220 },
        created_at: "2026-09-12T08:40:00Z",
      },
    ],
    reviews: [],
  },
  {
    ...base,
    id: "ms-04",
    sequence_order: 4,
    title: "Control de arvenses",
    description: "Control manual de arvenses entre surcos durante los primeros tres meses.",
    status: "ACTIVE",
    supplies_budget: 900000,
    labor_budget: 1500000,
    supplies_executed: 0,
    labor_executed: 0,
    required_evidences: [
      { field_key: "weeded_area_ha", label: "Área desyerbada (ha)", type: "number", min: 0.5, max: 10 },
      { field_key: "field_photos", label: "Fotos del lote desyerbado", type: "photo_array", min_items: 2 },
    ],
    evidence_logs: [],
    reviews: [],
  },
  {
    ...base,
    id: "ms-05",
    sequence_order: 5,
    title: "Primera cosecha y beneficio",
    description: "Recolección selectiva, beneficio húmedo y secado del café de la primera cosecha.",
    status: "LOCKED",
    supplies_budget: 3600000,
    labor_budget: 3900000,
    supplies_executed: 0,
    labor_executed: 0,
    required_evidences: [
      { field_key: "harvested_kg", label: "Café cereza recolectado (kg)", type: "number", min: 1 },
      { field_key: "drying_humidity_ok", label: "Humedad de secado dentro de rango", type: "boolean_system_check" },
      { field_key: "field_photos", label: "Fotos de la cosecha", type: "photo_array", min_items: 3 },
    ],
    evidence_logs: [],
    reviews: [],
  },
];

// A fresh deep copy per store so tests and sessions never share mutations.
export const createFixtureStore = (): MilestoneDetailDto[] => structuredClone([...FIXTURE_MILESTONES, ...EXTRA_MILESTONES]);
