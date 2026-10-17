import type { ArgumentsHost } from "@nestjs/common";
import { RequestMethod } from "@nestjs/common";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { ConverseUseCase, IntentDecisionUseCase } from "../application/assistant.use-cases";
import { PinUseCase } from "../application/pin";
import { FakeAssistantStore, FakePinStore } from "../application/testing";
import { AssistantTools } from "../application/tools";
import { UnavailableAssistantModel } from "../infrastructure/unavailable-assistant-model.adapter";
import { AssistantUnavailableError } from "../ports/assistant-model";
import { AssistantController } from "./assistant.controller";
import { AssistantUnavailableFilter, parseConfirmRequest, parseMessageRequest, toReplyResponse } from "./assistant.http";

const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (AssistantController.prototype as unknown as Record<string, object>)[handler] : AssistantController);
const route = (handler: string) => [RequestMethod[meta(METHOD_METADATA, handler)], `${meta(PATH_METADATA)}/${meta(PATH_METADATA, handler)}`];

describe("AssistantController", () => {
  it("uses ApiAuthGuard (session or DEMO_IDENTITY) then RolesGuard, the /api error body and the 503 filter", () => {
    expect(meta(GUARDS_METADATA)).toEqual([ApiAuthGuard, RolesGuard]);
    expect(meta(EXCEPTION_FILTERS_METADATA)).toEqual([ApiErrorFilter, AssistantUnavailableFilter]);
  });

  it("is for producers (seller) only", () => {
    expect(meta(ROLES_KEY)).toEqual(["seller"]);
  });

  it("serves the chat under /api/assistant", () => {
    expect(route("sendMessage")).toEqual(["POST", "api/assistant/messages"]);
    expect(route("getConversation")).toEqual(["GET", "api/assistant/conversations/:id"]);
    expect(route("confirm")).toEqual(["POST", "api/assistant/intents/:id/confirm"]);
    expect(route("reject")).toEqual(["POST", "api/assistant/intents/:id/reject"]);
    expect(route("pinStatus")).toEqual(["GET", "api/assistant/pin"]);
    expect(route("setPin")).toEqual(["PUT", "api/assistant/pin"]);
    expect(meta(HTTP_CODE_METADATA, "sendMessage")).toBe(200);
    expect(meta(HTTP_CODE_METADATA, "setPin")).toBe(204);
  });
});

describe("assistant wire shapes", () => {
  it("reads snake_case bodies and tolerates a confirm without a body", () => {
    expect(parseMessageRequest({ conversation_id: "c1", text: "Hola" })).toEqual({ conversationId: "c1", text: "Hola" });
    expect(() => parseMessageRequest("Hola")).toThrow();
    expect(parseConfirmRequest(undefined)).toEqual({ pin: undefined });
  });

  it("answers snake_case and leaves out intent when there is none", () => {
    const conversation = { id: "c1", userId: "u1", needsTechnician: false, createdAt: new Date() };
    expect(toReplyResponse({ conversation, reply: "Hola", intent: null })).toEqual({ conversation_id: "c1", reply: "Hola", needs_technician: false });
  });
});

describe("without ANTHROPIC_API_KEY", () => {
  it("answers 503 with the /api error body", () => {
    const sent: { status?: number; body?: unknown } = {};
    const response = { status: (code: number) => ((sent.status = code), { json: (body: unknown) => void (sent.body = body) }) };
    new AssistantUnavailableFilter().catch(new AssistantUnavailableError(), { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
    expect(sent).toEqual({ status: 503, body: { error: expect.stringMatching(/no está disponible/), errors: {} } });
  });

  it("raises that error before storing anything", async () => {
    const store = new FakeAssistantStore();
    const tools = {} as AssistantTools;
    const converse = new ConverseUseCase(store, new UnavailableAssistantModel(), tools, new IntentDecisionUseCase(store, tools, new PinUseCase(new FakePinStore())));
    await expect(converse.send({ id: "u1", role: "seller" }, { text: "Hola" })).rejects.toThrow(AssistantUnavailableError);
    expect(store.conversations.size).toBe(0);
    expect(store.messages).toEqual([]);
  });
});
