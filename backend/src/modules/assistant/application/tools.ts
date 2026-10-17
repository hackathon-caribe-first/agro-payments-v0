// The four PRD tools (RF-38): one read-only, three that only create pending intents. None reaches Open Payments or pays.
// Schemas are strict (additionalProperties: false everywhere) and listed in a fixed order so the prompt prefix caches.
import { Injectable } from "@nestjs/common";
import { DomainError, ValidationError } from "../../../shared/domain-errors";
import { LINE_KIND, LOG_TYPE, type Milestone, remainingCap, REQUIREMENT_TYPE } from "../../milestones/application/milestone";
import { addEvidenceLog, canRecordEvidence, type EvidenceLogRequest, PROGRESS_STATUS, type ProgressStatus, progressStatus } from "../../milestones/application/milestone-progress";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { MilestoneEvidenceUseCase } from "../../projects/application/milestone-evidence.use-case";
import { minorToPesos, PRODUCTION_TYPE, type NewProjectInput, validateNewProject, type Viewer } from "../../projects/application/project";
import { ProjectQueries } from "../../projects/application/project-queries";
import type { ToolCall, ToolDefinition } from "../ports/assistant-model";
import { type DraftProjectPayload, type EvidencePayloadIntent, type Intent, INTENT_TYPE, type IntentPayload } from "./assistant";
import { formatDate, formatPesos } from "./templates";

export const TOOL_NAME = {
  STATUS: "consultar_estado",
  DRAFT_PROJECT: "crear_borrador_proyecto",
  EVIDENCE: "crear_evidencia_hito",
  ORDER_LINE: "crear_linea_orden",
} as const;

const str = (description: string) => ({ type: "string", description });
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: TOOL_NAME.STATUS,
    description:
      "Lee el estado de los proyectos del productor: hitos con su id, estado, fechas, presupuesto de insumos y mano de obra, y los requisitos de evidencia. Úsela antes de responder sobre estado, plata o fechas, y para conocer el id de un hito.",
    inputSchema: obj({}, []),
  },
  {
    name: TOOL_NAME.DRAFT_PROJECT,
    description:
      "Prepara un proyecto en borrador con sus hitos para que el productor lo confirme con un «sí». No crea nada hasta esa confirmación. Montos en pesos enteros; fechas AAAA-MM-DD.",
    inputSchema: obj(
      {
        title: str("Nombre corto del proyecto, 3 a 120 caracteres."),
        description: str("Qué se va a hacer, al menos 10 caracteres."),
        production_type: { type: "string", enum: Object.values(PRODUCTION_TYPE), description: "Tipo de producción; OTRO si no es café, cacao ni aguacate." },
        start_date: { type: "string", format: "date" },
        estimated_end_date: { type: "string", format: "date" },
        milestones: {
          type: "array",
          description: "Hitos en orden.",
          items: obj(
            {
              title: str("Nombre del hito."),
              description: str("Qué se hace en el hito."),
              estimated_completion_date: { type: "string", format: "date" },
              supplies_budget: { type: "integer", description: "Insumos, pesos enteros." },
              labor_budget: { type: "integer", description: "Mano de obra del productor, pesos enteros, mayor que cero." },
            },
            ["title", "description", "estimated_completion_date", "supplies_budget", "labor_budget"],
          ),
        },
      },
      ["title", "description", "production_type", "start_date", "estimated_end_date", "milestones"],
    ),
  },
  {
    name: TOOL_NAME.EVIDENCE,
    description:
      "Prepara un registro de evidencia de un hito (notas, fotos, ubicación y lecturas de los requisitos) para que el productor lo confirme con un «sí». Use el id y los requisitos que devuelve consultar_estado.",
    inputSchema: obj(
      {
        milestone_id: str("Id del hito, tal como lo devuelve consultar_estado."),
        notes: str("Lo que el productor contó, en sus palabras."),
        log_type: { type: "string", enum: Object.values(LOG_TYPE) },
        photo_urls: { type: "array", items: { type: "string" }, description: "URLs de las fotos que el productor compartió." },
        latitude: { type: "number" },
        longitude: { type: "number" },
        readings: {
          type: "array",
          description: "Un valor por requisito numérico o de verificación.",
          items: obj({ field_key: str("Clave del requisito."), number_value: { type: "number" }, check_value: { type: "boolean" } }, ["field_key"]),
        },
      },
      ["milestone_id", "notes"],
    ),
  },
  {
    name: TOOL_NAME.ORDER_LINE,
    description:
      "Prepara una orden de compra de insumos para un hito. Queda pendiente hasta que el productor diga «sí» y escriba su PIN en la pantalla, y luego el operador la aprueba. No paga nada. Precio unitario en pesos enteros.",
    inputSchema: obj(
      {
        milestone_id: str("Id del hito, tal como lo devuelve consultar_estado."),
        supplier: str("Proveedor o almacén."),
        product: str("Producto, p. ej. urea."),
        quantity: { type: "number", description: "Cantidad, mayor que cero." },
        unit: str("Unidad, p. ej. bultos."),
        unit_price: { type: "integer", description: "Precio de cada unidad, pesos enteros, que dijo el productor." },
      },
      ["milestone_id", "supplier", "product", "quantity", "unit", "unit_price"],
    ),
  },
];

export type ToolOutcome = { kind: "result"; content: string; isError: boolean } | { kind: "intent"; payload: IntentPayload };

const STATUS_LABELS: Record<ProgressStatus, string> = {
  LOCKED: "bloqueado hasta aprobar el hito anterior",
  ACTIVE: "activo",
  SUPPLIES_ORDERED: "insumos en pago",
  SUPPLIES_PAID: "insumos pagados",
  IN_FIELD_EXECUTION: "en ejecución en el campo",
  SUBMITTED_FOR_REVIEW: "enviado a revisión",
  CHANGES_REQUESTED: "observado: debe corregir la evidencia",
  TECHNICALLY_APPROVED: "aprobado",
  LABOR_PAYOUT_PENDING: "aprobado, pago de mano de obra en curso",
  COMPLETED_AND_PAID: "terminado y pagado",
};

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Errors the model can act on (ask the producer again) go back as is_error tool results; anything else is a bug and throws. */
export function describeToolError(error: unknown): string | null {
  if (error instanceof ValidationError) {
    const fields = Object.entries(error.fieldErrors).map(([field, messages]) => `${field}: ${messages.join(" ")}`);
    return `Datos inválidos. ${fields.join("; ")}`;
  }
  if (error instanceof DomainError) return error.message;
  return null;
}

const linesPesos = (m: Milestone, kind: string) => minorToPesos(m.lines.filter((l) => l.kind === kind).reduce((sum, l) => sum + l.amount, 0), m.assetScale);
// v3: supplier lines join during execution, so the supplies budget is the ordered lines plus the cap still unallocated.
const suppliesPesos = (m: Milestone) => linesPesos(m, LINE_KIND.PROVEEDOR) + minorToPesos(remainingCap(m), m.assetScale);

function describeRequirement(r: Milestone["requirements"][number]) {
  const type = r.type === REQUIREMENT_TYPE.PHOTO_ARRAY ? `fotos, mínimo ${r.minItems}` : r.type === REQUIREMENT_TYPE.NUMBER ? "número" : "verificación sí/no";
  return `${r.fieldKey} (${r.label}; ${type})`;
}

@Injectable()
export class AssistantTools {
  constructor(
    private readonly queries: ProjectQueries,
    private readonly createProject: CreateProjectUseCase,
    private readonly evidence: MilestoneEvidenceUseCase,
  ) {}

  async run(call: ToolCall, viewer: Viewer, now: Date): Promise<ToolOutcome> {
    try {
      switch (call.name) {
        case TOOL_NAME.STATUS:
          return { kind: "result", content: await this.status(viewer), isError: false };
        case TOOL_NAME.DRAFT_PROJECT:
          return { kind: "intent", payload: this.draftProject(call.input) };
        case TOOL_NAME.EVIDENCE:
          return { kind: "intent", payload: await this.evidenceIntent(call.input, viewer, now) };
        case TOOL_NAME.ORDER_LINE:
          return { kind: "intent", payload: await this.orderLine(call.input, viewer) };
        default:
          return { kind: "result", content: `Herramienta desconocida: ${call.name}`, isError: true };
      }
    } catch (error) {
      const message = describeToolError(error);
      if (message === null) throw error;
      return { kind: "result", content: message, isError: true };
    }
  }

  /** Runs a confirmed intent through the same use cases as the app. Order lines only change status (operator approves). */
  async execute(intent: Intent, viewer: Viewer): Promise<Record<string, unknown> | null> {
    switch (intent.type) {
      case INTENT_TYPE.DRAFT_PROJECT: {
        const project = await this.createProject.execute(viewer, toProjectInput(intent.data));
        return { projectId: project.id, projectCode: project.projectCode };
      }
      case INTENT_TYPE.MILESTONE_EVIDENCE: {
        const log = await this.evidence.addLog(intent.data.milestoneId, viewer, toLogRequest(intent.data));
        return { milestoneId: intent.data.milestoneId, logId: log.id };
      }
      case INTENT_TYPE.ORDER_LINE:
        // The confirmed intent is the order of record (RF-34); the operator or fiduciaria approves it into a proveedor line
        // (POST /api/milestones/:id/orders/:intentId/approve). No payment from here.
        return { operatorApproval: "pending" };
    }
  }

  private async status(viewer: Viewer): Promise<string> {
    const projects = await this.queries.listOwned(viewer);
    if (projects.length === 0) return "El productor no tiene proyectos todavía.";
    const blocks = await Promise.all(
      projects.map(async (p) => {
        const milestones = await this.queries.milestones(p.id, viewer);
        const lines = milestones.map(({ milestone: m, status }) => {
          const date = m.estimatedCompletionDate ? `, para el ${formatDate(m.estimatedCompletionDate)}` : "";
          const requirements = m.requirements.length > 0 ? ` Requisitos: ${m.requirements.map(describeRequirement).join(", ")}.` : "";
          return `  - Hito ${m.sequenceOrder ?? "?"} «${m.title}» (id ${m.id}): ${STATUS_LABELS[status]}${date}. Insumos ${formatPesos(suppliesPesos(m))}, mano de obra ${formatPesos(linesPesos(m, LINE_KIND.PRODUCTOR))}. Registros de evidencia: ${m.evidenceLogs.length}.${requirements}`;
        });
        return [
          `Proyecto ${p.projectCode} «${p.title}», estado ${p.currentStatus}, del ${formatDate(p.startDate)} al ${formatDate(p.estimatedEndDate)}. Presupuesto ${formatPesos(minorToPesos(p.targetAmount, p.assetScale))}, desembolsado ${formatPesos(minorToPesos(p.totalDisbursed, p.assetScale))}.`,
          ...lines,
        ].join("\n");
      }),
    );
    return blocks.join("\n");
  }

  private draftProject(input: unknown): IntentPayload {
    if (!isObject(input) || !Array.isArray(input.milestones)) throw new ValidationError({ milestones: ["Agregue al menos un hito."] });
    const data: DraftProjectPayload = {
      title: asString(input.title),
      description: asString(input.description),
      productionType: asString(input.production_type),
      startDate: asString(input.start_date),
      estimatedEndDate: asString(input.estimated_end_date),
      milestones: input.milestones.filter(isObject).map((m) => ({
        title: asString(m.title),
        description: asString(m.description),
        estimatedCompletionDate: asString(m.estimated_completion_date),
        suppliesBudget: m.supplies_budget as number,
        laborBudget: m.labor_budget as number,
      })),
    };
    validateNewProject(toProjectInput(data));
    return { type: INTENT_TYPE.DRAFT_PROJECT, data };
  }

  private async evidenceIntent(input: unknown, viewer: Viewer, now: Date): Promise<IntentPayload> {
    if (!isObject(input)) throw new ValidationError({ milestone_id: ["Falta el hito."] });
    const { milestone, siblings } = await this.queries.load(asString(input.milestone_id), viewer);
    const photos = Array.isArray(input.photo_urls) ? input.photo_urls.filter((u): u is string => typeof u === "string") : [];
    const readings = Array.isArray(input.readings) ? input.readings.filter(isObject) : [];
    const evidencePayload: EvidencePayloadIntent["evidencePayload"] = {};
    for (const r of milestone.requirements) {
      const reading = readings.find((x) => x.field_key === r.fieldKey);
      const value = r.type === REQUIREMENT_TYPE.PHOTO_ARRAY ? photos : r.type === REQUIREMENT_TYPE.NUMBER ? reading?.number_value : reading?.check_value;
      if (value !== undefined) evidencePayload[r.fieldKey] = value as number | boolean | string[];
    }
    const location =
      typeof input.latitude === "number" && typeof input.longitude === "number" ? { latitude: input.latitude, longitude: input.longitude } : null;
    const data: EvidencePayloadIntent = {
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
      logType: typeof input.log_type === "string" ? input.log_type : photos.length > 0 ? LOG_TYPE.PHOTO_EVIDENCE : LOG_TYPE.AGRONOMIC_NOTE,
      notes: asString(input.notes),
      evidencePayload,
      photoCount: photos.length,
      location,
    };
    // Dry run of the same rule the confirmation applies, so a missing reading is asked now and not after the "sí".
    addEvidenceLog(milestone, siblings, toLogRequest(data), now);
    return { type: INTENT_TYPE.MILESTONE_EVIDENCE, data };
  }

  private async orderLine(input: unknown, viewer: Viewer): Promise<IntentPayload> {
    if (!isObject(input)) throw new ValidationError({ milestone_id: ["Falta el hito."] });
    const { milestone, siblings } = await this.queries.load(asString(input.milestone_id), viewer);
    const errors: Record<string, string[]> = {};
    const text = (key: string) => {
      const value = asString(input[key]);
      if (value.length === 0 || value.length > 120) errors[key] = ["Pregunte este dato al productor."];
      return value;
    };
    const supplier = text("supplier");
    const product = text("product");
    const unit = text("unit");
    const quantity = input.quantity;
    const unitPrice = input.unit_price;
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) errors.quantity = ["La cantidad debe ser mayor que cero."];
    if (typeof unitPrice !== "number" || !Number.isSafeInteger(unitPrice) || unitPrice <= 0) errors.unit_price = ["El precio debe ser un valor entero en pesos mayor que cero."];
    if (Object.keys(errors).length > 0) throw new ValidationError(errors);
    const total = Math.round((quantity as number) * (unitPrice as number));
    const status = progressStatus(milestone, siblings);
    if (!canRecordEvidence(status) && status !== PROGRESS_STATUS.SUPPLIES_ORDERED) {
      throw new DomainError(`El hito «${milestone.title}» no recibe órdenes ahora: está ${STATUS_LABELS[status]}.`);
    }
    // RF-16: the cap is what the grant still leaves unallocated; approved orders are already lines.
    // ponytail: confirmed orders still waiting for the operator are not subtracted; the approval re-checks the cap (409).
    const cap = minorToPesos(remainingCap(milestone), milestone.assetScale);
    if (!Number.isSafeInteger(total) || total > cap) {
      throw new DomainError(`La orden de ${formatPesos(total)} no cabe en el tope de insumos del hito «${milestone.title}» (${formatPesos(cap)}).`);
    }
    return {
      type: INTENT_TYPE.ORDER_LINE,
      data: { milestoneId: milestone.id, milestoneTitle: milestone.title, supplier, product, quantity: quantity as number, unit, unitPrice: unitPrice as number, total },
    };
  }
}

export const toProjectInput = (d: DraftProjectPayload): NewProjectInput => ({ ...d, milestones: d.milestones.map((m) => ({ ...m, requirements: [] })) });

export function toLogRequest(d: EvidencePayloadIntent): EvidenceLogRequest {
  const where = d.location ? ` [Ubicación: ${d.location.latitude}, ${d.location.longitude}]` : "";
  return { logType: d.logType, notes: `${d.notes}${where}`, evidencePayload: d.evidencePayload };
}
