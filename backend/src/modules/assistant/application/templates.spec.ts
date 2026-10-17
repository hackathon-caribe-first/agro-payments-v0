import { INTENT_TYPE, type IntentPayload } from "./assistant";
import { confirmationPrompt, decisionReply, formatDate, formatPesos, summarize } from "./templates";

const order: IntentPayload = {
  type: INTENT_TYPE.ORDER_LINE,
  data: { milestoneId: "m1", milestoneTitle: "Fertilización", supplier: "Almacén Don Pedro", product: "urea", quantity: 20, unit: "bultos", unitPrice: 125_000, total: 2_500_000 },
};
const draft: IntentPayload = {
  type: INTENT_TYPE.DRAFT_PROJECT,
  data: {
    title: "Maíz lote de abajo",
    description: "Siembra de maíz en dos hectáreas",
    productionType: "OTRO",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-30",
    milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 1_000_000, laborBudget: 500_000 }],
  },
};
const evidence: IntentPayload = {
  type: INTENT_TYPE.MILESTONE_EVIDENCE,
  data: { milestoneId: "m1", milestoneTitle: "Fertilización", logType: "PHOTO_EVIDENCE", notes: "Ya fertilicé", evidencePayload: {}, photoCount: 2, location: { latitude: 4.6, longitude: -74.08 } },
};

describe("assistant templates (amounts, dates and names come from the payload, never from the model)", () => {
  it("formats whole pesos and ISO dates deterministically", () => {
    expect(formatPesos(2_500_000)).toBe("$2.500.000");
    expect(formatPesos(0)).toBe("$0");
    expect(formatDate("2027-01-15")).toBe("15 de enero de 2027");
  });

  it("reads an order line back with supplier, product, quantity and total", () => {
    expect(summarize(order)).toBe("Orden de compra para el hito «Fertilización»: 20 bultos de urea a Almacén Don Pedro, a $125.000 cada uno, total $2.500.000.");
  });

  it("reads a draft project back with its dates, milestones and total", () => {
    expect(summarize(draft)).toBe(
      "Proyecto «Maíz lote de abajo» (Otro cultivo), del 1 de noviembre de 2026 al 30 de marzo de 2027. Hitos: 1) Siembra, para el 1 de diciembre de 2026: insumos $1.000.000 y mano de obra $500.000. Total: $1.500.000.",
    );
  });

  it("reads evidence back with photos and location", () => {
    expect(summarize(evidence)).toBe("Evidencia para el hito «Fertilización»: «Ya fertilicé». 2 fotos. Ubicación 4.6, -74.08.");
  });

  it("asks for «sí», and for the PIN on the screen only when the intent needs it", () => {
    expect(confirmationPrompt(order, true)).toMatch(/responda «sí».*PIN de 4 dígitos en la pantalla/is);
    expect(confirmationPrompt(order, true)).toMatch(/operador/);
    expect(confirmationPrompt(draft, false)).not.toMatch(/PIN/);
    expect(confirmationPrompt(draft, false)).toMatch(/«sí»/);
  });

  it("answers the decision from the result, not from the model", () => {
    expect(decisionReply(draft, "confirmed", { projectCode: "AGR-2026-001" })).toBe("Listo. Creé el proyecto en borrador con el código AGR-2026-001.");
    expect(decisionReply(order, "confirmed", null)).toMatch(/operador/);
    expect(decisionReply(order, "rejected", null)).toBe("Listo, cancelé la solicitud. No se hizo ningún cambio.");
  });
});
