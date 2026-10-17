import { DomainError, NotFoundError, ValidationError } from "../../../shared/domain-errors";
import { FakeRepository } from "../../milestones/application/testing";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { MilestoneEvidenceUseCase } from "../../projects/application/milestone-evidence.use-case";
import type { NewProjectInput, Viewer } from "../../projects/application/project";
import { ProjectQueries } from "../../projects/application/project-queries";
import { FakeProjectRepository } from "../../projects/application/testing";
import type { ModelTurn } from "../ports/assistant-model";
import { INTENT_STATUS, INTENT_TTL_MS } from "./assistant";
import { ConverseUseCase, HIDDEN_PIN_TEXT, IntentDecisionUseCase, MAX_MODEL_STEPS } from "./assistant.use-cases";
import { PinUseCase } from "./pin";
import { NOT_UNDERSTOOD_REPLY, PIN_IN_CHAT_REPLY, PIN_NEEDED_REPLY, REFUSAL_REPLY, SYSTEM_PROMPT } from "./system-prompt";
import { answer, callTool, FakeAssistantStore, FakePinStore, ScriptedModel } from "./testing";
import { AssistantTools, TOOL_NAME } from "./tools";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const producer: Viewer = { id: "u1", role: "seller" };
const stranger: Viewer = { id: "u2", role: "seller" };

const projectInput = (): NewProjectInput => ({
  title: "Café Castillo",
  description: "Renovación del cafetal",
  productionType: "CAFE_ESPECIAL",
  startDate: "2026-11-01",
  estimatedEndDate: "2027-03-30",
  milestones: [
    {
      title: "Fertilización",
      description: "Abonar el lote",
      estimatedCompletionDate: "2026-12-01",
      suppliesBudget: 1_000_000,
      laborBudget: 500_000,
      requirements: [{ fieldKey: "bultos", label: "Bultos aplicados", type: "number", min: 1 }],
    },
  ],
});

async function setup(turns: ModelTurn[] | ((milestoneId: string) => ModelTurn[]) = []) {
  const milestones = new FakeRepository(new Map());
  const projects = new FakeProjectRepository(milestones);
  const queries = new ProjectQueries(projects, milestones);
  const create = new CreateProjectUseCase(projects, wallets);
  const tools = new AssistantTools(queries, create, new MilestoneEvidenceUseCase(queries, milestones));
  const store = new FakeAssistantStore();
  const pins = new PinUseCase(new FakePinStore());
  const decisions = new IntentDecisionUseCase(store, tools, pins);
  const project = await create.execute(producer, projectInput());
  // Milestones stay LOCKED until custody is funded (negotiations block); evidence is recorded on a funded project.
  (await projects.findById(project.id))!.currentStatus = "FUNDED_IN_CUSTODY";
  const milestoneId = `${project.id}-ms-1`;
  const model = new ScriptedModel(typeof turns === "function" ? turns(milestoneId) : turns);
  return { model, store, pins, decisions, projects, milestones, project, milestoneId, converse: new ConverseUseCase(store, model, tools, decisions) };
}

const order = (milestoneId: string, unitPrice = 125_000) => ({ milestone_id: milestoneId, supplier: "Almacén Don Pedro", product: "urea", quantity: 2, unit: "bultos", unit_price: unitPrice });

describe("ConverseUseCase: tool loop", () => {
  it("answers a status question from consultar_estado, echoing the model's own blocks back unchanged", async () => {
    const s = await setup([callTool(TOOL_NAME.STATUS, {}), answer("Va en el hito de fertilización.")]);
    const result = await s.converse.send(producer, { text: "¿Cuánto me falta?" });

    expect(result).toMatchObject({ reply: "Va en el hito de fertilización.", intent: null });
    const [first, second] = s.model.requests;
    expect(first.system).toBe(SYSTEM_PROMPT);
    expect(first.tools.map((t) => t.name)).toEqual(["consultar_estado", "crear_borrador_proyecto", "crear_evidencia_hito", "crear_linea_orden"]);
    expect(second.messages[1]).toEqual({ role: "assistant", text: "", raw: callTool(TOOL_NAME.STATUS, {}).raw });
    const toolResults = second.messages[2];
    expect(toolResults.role).toBe("tool_results");
    const content = toolResults.role === "tool_results" ? toolResults.results[0].content : "";
    expect(content).toContain(s.project.projectCode);
    expect(content).toContain(`id ${s.milestoneId}`);
    expect(content).toContain("Insumos $1.000.000");
    expect(s.store.messages.map((m) => m.role)).toEqual(["user", "tool", "assistant"]);
  });

  it("keeps earlier turns as text history in the next request", async () => {
    const s = await setup([answer("Hola, ¿en qué le ayudo?"), answer("Claro.")]);
    const first = await s.converse.send(producer, { text: "Hola" });
    await s.converse.send(producer, { conversationId: first.conversation.id, text: "Gracias" });
    expect(s.model.requests[1].messages).toEqual([
      { role: "user", text: "Hola" },
      { role: "assistant", text: "Hola, ¿en qué le ayudo?" },
      { role: "user", text: "Gracias" },
    ]);
  });

  it("returns a tool error to the model as is_error so it can ask again, and creates no intent", async () => {
    const s = await setup([callTool(TOOL_NAME.ORDER_LINE, order("", 0)), answer("¿A cuánto le vendieron cada bulto?")]);
    await s.converse.send(producer, { text: "Necesito urea" });
    const results = s.model.requests[1].messages[2];
    expect(results.role === "tool_results" && results.results[0].isError).toBe(true);
    expect(s.store.intents.size).toBe(0);
  });

  it("says when an order does not fit the milestone's supplies cap", async () => {
    const s = await setup((id) => [callTool(TOOL_NAME.ORDER_LINE, { ...order(id), quantity: 100 }), answer("No cabe.")]);
    await s.converse.send(producer, { text: "Cien bultos" });
    const capped = s.model.requests[1].messages[2];
    expect(capped.role === "tool_results" && capped.results[0]).toMatchObject({ isError: true, content: expect.stringMatching(/no cabe en el tope de insumos.*\$1\.000\.000/) });
    expect(s.store.intents.size).toBe(0);
  });

  it(`escalates to a technician after ${MAX_MODEL_STEPS} model steps without an answer`, async () => {
    const s = await setup(Array.from({ length: MAX_MODEL_STEPS }, () => callTool(TOOL_NAME.STATUS, {})));
    const result = await s.converse.send(producer, { text: "..." });
    expect(result.reply).toBe(NOT_UNDERSTOOD_REPLY);
    expect(s.store.conversations.get(result.conversation.id)?.needsTechnician).toBe(true);
  });

  it("handles a refusal and a truncated turn without reading their content, and flags the conversation", async () => {
    const refused = await setup([{ outcome: "refusal", text: "partial", toolCalls: [], raw: [] }]);
    const r1 = await refused.converse.send(producer, { text: "x" });
    expect(r1).toMatchObject({ reply: REFUSAL_REPLY, conversation: { needsTechnician: true } });

    const truncated = await setup([{ outcome: "truncated", text: "half a sent", toolCalls: [{ id: "t", name: TOOL_NAME.ORDER_LINE, input: {} }], raw: [] }]);
    const r2 = await truncated.converse.send(producer, { text: "x" });
    expect(r2.reply).toBe(NOT_UNDERSTOOD_REPLY);
    expect(truncated.store.intents.size).toBe(0);
  });

  it("flags the conversation when the model says it did not understand (RF-37)", async () => {
    const s = await setup([answer("No entendí. Un técnico lo va a llamar.")]);
    const result = await s.converse.send(producer, { text: "asdf" });
    expect(s.store.conversations.get(result.conversation.id)?.needsTechnician).toBe(true);
  });

  it("rejects an empty message and another producer's conversation", async () => {
    const s = await setup([answer("Hola")]);
    await expect(s.converse.send(producer, { text: "  " })).rejects.toThrow(ValidationError);
    const { conversation } = await s.converse.send(producer, { text: "Hola" });
    await expect(s.converse.send(stranger, { conversationId: conversation.id, text: "Hola" })).rejects.toThrow(NotFoundError);
    await expect(s.converse.get(stranger, conversation.id)).rejects.toThrow(NotFoundError);
  });
});

describe("Order line intents: template, PIN and no payment path", () => {
  it("ends the turn with a code-rendered template instead of a model reply, and pays nothing", async () => {
    const s = await setup((id) => [callTool(TOOL_NAME.ORDER_LINE, order(id))]);
    const result = await s.converse.send(producer, { text: "Necesito dos bultos de urea a 125 mil" });

    expect(s.model.requests).toHaveLength(1);
    expect(result.intent).toMatchObject({ type: "ORDER_LINE", status: INTENT_STATUS.PENDING, requiresPin: true, data: { total: 250_000 } });
    expect(result.reply).toContain("2 bultos de urea a Almacén Don Pedro, a $125.000 cada uno, total $250.000.");
    expect(result.reply).toMatch(/PIN de 4 dígitos en la pantalla/);
    expect((await s.milestones.findById(s.milestoneId))!.lines.every((l) => l.status === "pendiente")).toBe(true);
  });
});

async function pendingOrder(pin = "4321") {
  const s = await setup((id) => [callTool(TOOL_NAME.ORDER_LINE, order(id)), answer("¿Algo más?")]);
  await s.pins.set(producer.id, { pin });
  const { conversation, intent } = await s.converse.send(producer, { text: "Dos bultos de urea" });
  return { ...s, conversation, intent: intent! };
}

describe("IntentDecisionUseCase", () => {
  it("confirms an order line only with the right PIN, records who and when, and leaves the money untouched", async () => {
    const s = await pendingOrder();
    await expect(s.decisions.confirm(producer, s.intent.id)).rejects.toThrow(ValidationError);
    await expect(s.decisions.confirm(producer, s.intent.id, "0000")).rejects.toThrow(/PIN incorrecto/);
    const { intent, reply } = await s.decisions.confirm(producer, s.intent.id, "4321");
    expect(intent).toMatchObject({ status: INTENT_STATUS.CONFIRMED, decidedBy: "u1", result: { operatorApproval: "pending" } });
    expect(intent.decidedAt).toBeInstanceOf(Date);
    expect(reply).toMatch(/espera la aprobación del operador/);
    expect((await s.milestones.findById(s.milestoneId))!.lines.every((l) => l.status === "pendiente")).toBe(true);
    await expect(s.decisions.confirm(producer, s.intent.id, "4321")).rejects.toThrow(DomainError);
  });

  it("never sends the PIN to the model nor keeps it in the conversation (RNF-12)", async () => {
    const s = await pendingOrder("4321");
    const inChat = await s.converse.send(producer, { conversationId: s.conversation.id, text: "4321" });
    expect(inChat.reply).toBe(PIN_IN_CHAT_REPLY);
    const sayYes = await s.converse.send(producer, { conversationId: s.conversation.id, text: "Sí" });
    expect(sayYes.reply).toBe(PIN_NEEDED_REPLY);
    await s.decisions.confirm(producer, s.intent.id, "4321");
    await s.converse.send(producer, { conversationId: s.conversation.id, text: "¿Y ahora qué sigue?" });

    expect(s.model.requests).toHaveLength(2);
    expect(JSON.stringify(s.model.requests)).not.toContain("4321");
    expect(JSON.stringify(s.store.messages)).not.toContain("4321");
    expect(s.store.messages.map((m) => m.text)).toContain(HIDDEN_PIN_TEXT);
  });

  it("hides another producer's intent and refuses an expired one", async () => {
    const s = await pendingOrder();
    await expect(s.decisions.confirm(stranger, s.intent.id, "4321")).rejects.toThrow(NotFoundError);
    await expect(s.decisions.reject(stranger, s.intent.id)).rejects.toThrow(NotFoundError);
    s.store.intents.get(s.intent.id)!.createdAt = new Date(Date.now() - INTENT_TTL_MS - 1000);
    await expect(s.decisions.confirm(producer, s.intent.id, "4321")).rejects.toThrow(/venció/);
    expect(s.store.intents.get(s.intent.id)!.status).toBe(INTENT_STATUS.EXPIRED);
  });

  it("rejects a pending intent with «no» typed in the chat", async () => {
    const s = await pendingOrder();
    const result = await s.converse.send(producer, { conversationId: s.conversation.id, text: "no" });
    expect(result.intent).toMatchObject({ status: INTENT_STATUS.REJECTED, decidedBy: "u1" });
    expect(result.reply).toMatch(/cancelé/);
  });
});

describe("Draft project and evidence intents need only «sí»", () => {
  const draft = {
    title: "Maíz lote de abajo",
    description: "Siembra de maíz en dos hectáreas",
    production_type: "OTRO",
    start_date: "2026-11-01",
    estimated_end_date: "2027-03-30",
    milestones: [{ title: "Siembra", description: "Sembrar", estimated_completion_date: "2026-12-01", supplies_budget: 1_000_000, labor_budget: 500_000 }],
  };

  it("creates the DRAFT project through the create-project use case when the producer says «sí»", async () => {
    const s = await setup([callTool(TOOL_NAME.DRAFT_PROJECT, draft)]);
    const { conversation, intent, reply } = await s.converse.send(producer, { text: "Quiero sembrar maíz" });
    expect(intent).toMatchObject({ type: "DRAFT_PROJECT", requiresPin: false });
    expect(reply).toMatch(/Total: \$1\.500\.000\.\n¿Está bien\? Responda «sí»/);
    expect(await s.projects.findByOwner("u1")).toHaveLength(1);

    const confirmed = await s.converse.send(producer, { conversationId: conversation.id, text: "sí" });
    const created = (await s.projects.findByOwner("u1"))[1];
    expect(created).toMatchObject({ title: "Maíz lote de abajo", currentStatus: "DRAFT", ownerUserId: "u1" });
    expect(confirmed.reply).toBe(`Listo. Creé el proyecto en borrador con el código ${created.projectCode}.`);
    expect(confirmed.intent).toMatchObject({ status: INTENT_STATUS.CONFIRMED, result: { projectId: created.id } });
  });

  it("returns project validation errors to the model", async () => {
    const s = await setup([callTool(TOOL_NAME.DRAFT_PROJECT, { ...draft, title: "x" }), answer("¿Cómo se llama el proyecto?")]);
    await s.converse.send(producer, { text: "Quiero sembrar" });
    const results = s.model.requests[1].messages[2];
    expect(results.role === "tool_results" && results.results[0]).toMatchObject({ isError: true, content: expect.stringContaining("title") });
  });

  it("asks for a missing requirement reading, then records the evidence log with its location on «sí»", async () => {
    const base = (id: string) => ({ milestone_id: id, notes: "Ya fertilicé", latitude: 4.6, longitude: -74.08 });
    const s = await setup((id) => [
      callTool(TOOL_NAME.EVIDENCE, base(id)),
      callTool(TOOL_NAME.EVIDENCE, { ...base(id), readings: [{ field_key: "bultos", number_value: 20 }] }, "toolu_2"),
    ]);
    const { conversation, intent } = await s.converse.send(producer, { text: "Ya fertilicé" });
    const missing = s.model.requests[1].messages[2];
    expect(missing.role === "tool_results" && missing.results[0]).toMatchObject({ isError: true, content: expect.stringContaining("evidencePayload.bultos") });
    expect(intent).toMatchObject({ type: "MILESTONE_EVIDENCE", requiresPin: false });

    await s.converse.send(producer, { conversationId: conversation.id, text: "Sí" });
    const [log] = (await s.milestones.findById(s.milestoneId))!.evidenceLogs;
    expect(log).toMatchObject({ notes: "Ya fertilicé [Ubicación: 4.6, -74.08]", evidencePayload: { bultos: 20 } });
  });
});
