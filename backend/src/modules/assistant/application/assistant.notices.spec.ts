// RF-37 (notices into the conversation, «no entendí» escalation) and RF-35 (evidence with location and photo hashes).
import { InProcessDomainEvents, type DomainEvent } from "../../../shared/events/domain-events";
import { FakeRepository } from "../../milestones/application/testing";
import { CreateProjectUseCase } from "../../projects/application/create-project.use-case";
import { MilestoneEvidenceUseCase } from "../../projects/application/milestone-evidence.use-case";
import type { Viewer } from "../../projects/application/project";
import { ProjectQueries } from "../../projects/application/project-queries";
import { FakeProjectRepository } from "../../projects/application/testing";
import type { ModelTurn } from "../ports/assistant-model";
import { ConverseUseCase, IntentDecisionUseCase } from "./assistant.use-cases";
import { ConversationInbox } from "./inbox";
import { PinUseCase } from "./pin";
import { answer, callTool, FakeAssistantStore, FakePinStore, ScriptedModel } from "./testing";
import { AssistantTools, TOOL_DEFINITIONS, TOOL_NAME } from "./tools";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const producer: Viewer = { id: "u1", role: "seller" };
const PHOTO = "https://img.test/lote.jpg";
const HASH = "c".repeat(64);

async function setup(turns: (milestoneId: string) => ModelTurn[] = () => []) {
  const milestones = new FakeRepository(new Map());
  const projects = new FakeProjectRepository(milestones);
  const queries = new ProjectQueries(projects, milestones);
  const create = new CreateProjectUseCase(projects, wallets);
  const tools = new AssistantTools(queries, create, new MilestoneEvidenceUseCase(queries, milestones));
  const store = new FakeAssistantStore();
  const events = new InProcessDomainEvents();
  const published: DomainEvent[] = [];
  events.subscribe((e) => {
    published.push(e);
  });
  const project = await create.execute(producer, {
    title: "Tomate P2",
    description: "Tomate bajo invernadero",
    productionType: "OTRO",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-30",
    milestones: [
      {
        title: "Fertilización",
        description: "Abonar",
        estimatedCompletionDate: "2026-12-01",
        suppliesBudget: 100,
        laborBudget: 100,
        requirements: [{ fieldKey: "fotos", label: "Fotos del lote", type: "photo_array", minItems: 1 }],
      },
    ],
  });
  (await projects.findById(project.id))!.currentStatus = "FUNDED_IN_CUSTODY";
  const milestoneId = `${project.id}-ms-1`;
  const model = new ScriptedModel(turns(milestoneId));
  const decisions = new IntentDecisionUseCase(store, tools, new PinUseCase(new FakePinStore()));
  const converse = new ConverseUseCase(store, model, tools, decisions, events);
  return { store, model, converse, events, published, milestones, milestoneId };
}

describe("«no entendí» (RF-37)", () => {
  it("escalates to a technician straight away, without asking the model, and publishes the escalation", async () => {
    const s = await setup();
    const { reply, conversation } = await s.converse.send(producer, { text: "No entendí" });
    expect(s.model.requests).toHaveLength(0);
    expect(reply).toMatch(/técnico/);
    expect(s.store.conversations.get(conversation.id)?.needsTechnician).toBe(true);
    await s.events.drain();
    expect(s.published).toEqual([{ type: "assistant.escalated", userId: "u1", conversationId: conversation.id, lastUserMessage: "No entendí" }]);
  });

  it("publishes the escalation when the model itself does not understand", async () => {
    const s = await setup(() => [answer("No entendí. Un técnico lo va a llamar.")]);
    await s.converse.send(producer, { text: "asdf qwer" });
    await s.events.drain();
    expect(s.published.map((e) => e.type)).toEqual(["assistant.escalated"]);
  });
});

describe("ConversationInbox (RF-37 delivery)", () => {
  it("appends the notice as an assistant message to the producer's latest conversation", async () => {
    const s = await setup(() => [answer("Hola")]);
    const { conversation } = await s.converse.send(producer, { text: "Hola" });
    await new ConversationInbox(s.store).deliver("u1", "Su hito fue aprobado.");
    expect((await s.store.listMessages(conversation.id)).at(-1)).toMatchObject({ role: "assistant", text: "Su hito fue aprobado." });
  });

  it("opens a conversation when the producer has none", async () => {
    const store = new FakeAssistantStore();
    await new ConversationInbox(store).deliver("u9", "Su proyecto quedó activo.");
    const [conversation] = [...store.conversations.values()];
    expect(conversation).toMatchObject({ userId: "u9", needsTechnician: false });
    expect(await store.listMessages(conversation.id)).toEqual([expect.objectContaining({ role: "assistant", text: "Su proyecto quedó activo." })]);
  });
});

describe("crear_evidencia_hito with location and photo hashes (RF-35)", () => {
  it("declares photo_hashes strictly", () => {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === TOOL_NAME.EVIDENCE)!;
    expect((tool.inputSchema as { properties: Record<string, unknown> }).properties.photo_hashes).toEqual({
      type: "array",
      description: expect.any(String),
      items: { type: "object", properties: { url: expect.any(Object), sha256: expect.any(Object) }, required: ["url", "sha256"], additionalProperties: false },
    });
  });

  it("stores the location and each photo's hash on the evidence log after «sí»", async () => {
    const s = await setup((id) => [
      callTool(TOOL_NAME.EVIDENCE, { milestone_id: id, notes: "Ya fertilicé", photo_urls: [PHOTO], photo_hashes: [{ url: PHOTO, sha256: HASH }], latitude: 4.6, longitude: -74.08 }),
    ]);
    const { conversation } = await s.converse.send(producer, { text: "Ya fertilicé" });
    await s.converse.send(producer, { conversationId: conversation.id, text: "Sí" });
    const [log] = (await s.milestones.findById(s.milestoneId))!.evidenceLogs;
    expect(log.attestation).toEqual({ location: { latitude: 4.6, longitude: -74.08 }, photoHashes: [{ url: PHOTO, sha256: HASH }] });
  });
});
