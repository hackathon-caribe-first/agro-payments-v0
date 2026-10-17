// Runs the real migrations against a throwaway local *_test database; skips when it is unreachable.
// Everything lives in its own schema (search_path), so dropSchema here never races the other persistence suites.
import { DataSource } from "typeorm";
import { MIGRATIONS } from "../../../shared/database/migrations";
import { PostgresPaymentStepRepository } from "./postgres-payment-step.repository";

const url = process.env.TEST_DATABASE_URL ?? "postgres://agro:agro@localhost:5432/agro_test";
// dropSchema wipes the database: refuse anything that is not a *_test database.
if (!/_test(_[a-z]+)?$/.test(new URL(url).pathname)) throw new Error(`Refusing to run persistence specs against ${new URL(url).pathname}`);

let dataSource: DataSource | null = null;
const db = (ctx: { skip: (note?: string) => never }) => dataSource ?? ctx.skip("test database unreachable");

const SCHEMA = "payment_steps_spec";

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
  await dataSource?.query("TRUNCATE payment_steps");
});

describe("PostgresPaymentStepRepository", () => {
  it("writes a step once (ON CONFLICT DO NOTHING) and lists oldest first, filtered", async (ctx) => {
    const steps = new PostgresPaymentStepRepository(db(ctx));
    const deposit = { kind: "buyer_deposit" as const, paymentId: "qr-1", projectId: "p-1", detail: null };
    await steps.record({ ...deposit, step: "outgoing_created", opUrl: "https://rs.test/outgoing-payments/o-1" });
    await steps.record({ ...deposit, step: "sent_unconfirmed", opUrl: "https://rs.test/outgoing-payments/o-1", detail: { attempts: 6 } });
    await steps.record({ ...deposit, step: "sent_unconfirmed", opUrl: "https://rs.test/outgoing-payments/o-2" });
    await steps.record({ kind: "milestone_line", paymentId: "p-2-ms-1:l-1", projectId: "p-2", step: "completed", opUrl: null, detail: null });

    const rows = await steps.list({ projectId: "p-1", limit: 200 });
    expect(rows.map((r) => [r.step, r.opUrl, r.detail])).toEqual([
      ["outgoing_created", "https://rs.test/outgoing-payments/o-1", null],
      ["sent_unconfirmed", "https://rs.test/outgoing-payments/o-1", { attempts: 6 }],
    ]);
    expect(rows[0].at).toBeInstanceOf(Date);
    expect(await steps.list({ paymentKind: "milestone_line", paymentId: "p-2-ms-1:l-1", limit: 200 })).toHaveLength(1);
    expect(await steps.list({ limit: 1 })).toHaveLength(1);
  });
});
