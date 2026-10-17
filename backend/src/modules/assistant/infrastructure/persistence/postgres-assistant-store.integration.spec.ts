// Runs the real migrations against a throwaway local *_test database; skips when it is unreachable.
// Everything lives in its own schema (search_path), so dropSchema here never races the milestones suite on the same database.
import { DataSource } from "typeorm";
import { MIGRATIONS } from "../../../../shared/database/migrations";
import type { Intent } from "../../application/assistant";
import { PinUseCase } from "../../application/pin";
import { PostgresAssistantStore, PostgresPinStore } from "./postgres-assistant-store.adapter";

const url = process.env.TEST_DATABASE_URL ?? "postgres://agro:agro@localhost:5432/agro_test";
// dropSchema wipes the database: refuse anything that is not a *_test database.
if (!/_test(_[a-z]+)?$/.test(new URL(url).pathname)) throw new Error(`Refusing to run persistence specs against ${new URL(url).pathname}`);

let dataSource: DataSource | null = null;
const db = (ctx: { skip: (note?: string) => never }) => dataSource ?? ctx.skip("test database unreachable");

const SCHEMA = "assistant_spec";

beforeAll(async () => {
  const setup = await new DataSource({ type: "postgres", url }).initialize().catch(() => null);
  if (!setup) return;
  await setup.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
  await setup.destroy();
  const options = `-c search_path=${SCHEMA}`;
  const candidate = new DataSource({ type: "postgres", url, schema: SCHEMA, extra: { options }, migrations: MIGRATIONS, migrationsRun: true, dropSchema: true });
  dataSource = await candidate.initialize().catch(() => null);
});
afterAll(() => dataSource?.destroy());
beforeEach(async () => {
  await dataSource?.query("TRUNCATE assistant_conversations, assistant_messages, assistant_intents, assistant_pins CASCADE");
});

const t0 = new Date("2026-10-17T12:00:00.000Z");
const conversation = { id: "c1", userId: "u1", needsTechnician: false, createdAt: t0 };
const intent: Intent = {
  type: "ORDER_LINE",
  data: { milestoneId: "m1", milestoneTitle: "Fertilización", supplier: "Don Pedro", product: "urea", quantity: 2, unit: "bultos", unitPrice: 125_000, total: 250_000 },
  id: "i1",
  conversationId: "c1",
  userId: "u1",
  summary: "Orden",
  requiresPin: true,
  status: "pending",
  createdAt: t0,
  decidedAt: null,
  decidedBy: null,
  result: null,
};

describe("PostgresAssistantStore", () => {
  it("round-trips a conversation, its messages in order and the technician flag", async (ctx) => {
    const store = new PostgresAssistantStore(db(ctx));
    await store.createConversation(conversation);
    const messages = ["user", "tool", "assistant"].map((role, i) => ({ id: `m${i}`, conversationId: "c1", role: role as "user", text: `t${i}`, createdAt: t0 }));
    await store.appendMessages(messages);
    await store.flagTechnician("c1");
    expect(await store.findConversation("c1")).toEqual({ ...conversation, needsTechnician: true });
    expect(await store.listMessages("c1")).toEqual(messages);
    expect(await store.findConversation("nope")).toBeNull();
  });

  it("stores an intent and updates only its decision, keeping the payload as audit", async (ctx) => {
    const store = new PostgresAssistantStore(db(ctx));
    await store.createConversation(conversation);
    await store.saveIntent(intent);
    expect(await store.findIntent("i1")).toEqual(intent);
    const decided: Intent = { ...intent, status: "confirmed", decidedAt: t0, decidedBy: "u1", result: { operatorApproval: "pending" }, summary: "changed" };
    await store.saveIntent(decided);
    expect(await store.listIntents("c1")).toEqual([{ ...decided, summary: "Orden" }]);
  });

  it("rejects an unknown intent status", async (ctx) => {
    const store = new PostgresAssistantStore(db(ctx));
    await store.createConversation(conversation);
    await expect(store.saveIntent({ ...intent, status: "paid" as Intent["status"] })).rejects.toThrow();
  });
});

describe("PostgresPinStore", () => {
  it("keeps the hash, not the PIN, and counts failed attempts", async (ctx) => {
    const store = new PostgresPinStore(db(ctx));
    const pins = new PinUseCase(store);
    await pins.set("u1", { pin: "4321" });
    await pins.verify("u1", "0000").catch(() => {});
    const row = await store.find("u1");
    expect(row).toMatchObject({ userId: "u1", failedAttempts: 1 });
    expect(JSON.stringify(row)).not.toContain("4321");
    await expect(pins.verify("u1", "4321")).resolves.toBeUndefined();
  });
});
