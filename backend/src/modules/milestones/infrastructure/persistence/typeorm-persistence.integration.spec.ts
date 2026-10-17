// Runs the real migrations against a throwaway local database (agro_test, never the dev one); skips when it is unreachable.
import { randomBytes } from "node:crypto";
import { DataSource } from "typeorm";
import { SecretCipher } from "../../../../shared/crypto/secret-cipher";
import { MIGRATIONS } from "../../../../shared/database/migrations";
import { buildProject, type NewProjectInput } from "../../../projects/application/project";
import { PROJECT_ENTITIES } from "../../../projects/infrastructure/persistence/entities";
import { TypeOrmProjectAdapter } from "../../../projects/infrastructure/persistence/typeorm-project.adapter";
import { addEvidenceLog, submitForReview } from "../../application/milestone-progress";
import { applyLineResult, fund, type Milestone, review, submitEvidence } from "../../application/milestone";
import { sampleMilestone, unfundedMilestone } from "../../application/testing";
import { type Grant, GRANT_PURPOSE, GRANT_STATUS } from "../../ports/grant-store";
import { demoMilestones } from "../demo-milestones";
import { MILESTONE_ENTITIES } from "./entities";
import { TypeOrmGrantStore } from "./typeorm-grant-store.adapter";
import { TypeOrmMilestoneAdapter } from "./typeorm-milestone.adapter";

const url = process.env.TEST_DATABASE_URL ?? "postgres://agro:agro@localhost:5432/agro_test";
// dropSchema wipes the database: refuse anything that is not a *_test database.
if (!new URL(url).pathname.endsWith("_test")) throw new Error(`Refusing to run persistence specs against ${new URL(url).pathname}`);

let dataSource: DataSource | null = null;
const db = (ctx: { skip: (note?: string) => never }) => dataSource ?? ctx.skip("agro_test database unreachable");

beforeAll(async () => {
  const candidate = new DataSource({ type: "postgres", url, entities: [...MILESTONE_ENTITIES, ...PROJECT_ENTITIES], migrations: MIGRATIONS, migrationsRun: true, dropSchema: true });
  dataSource = await candidate.initialize().catch(() => null);
});
afterAll(() => dataSource?.destroy());
beforeEach(async () => {
  await dataSource?.query("TRUNCATE grants, milestone_lines, milestones CASCADE");
});

const cop = (value: number) => ({ value, assetCode: "COP", assetScale: 2 });
const now = new Date("2026-10-16T12:00:00.000Z");
// Approved, observed once, one line settled with a full receipt, one queued, one failed.
const busyMilestone = (): Milestone => {
  let m = submitEvidence(sampleMilestone(), "Foto del lote", now);
  m = review(m, "approved", null, now);
  m = applyLineResult(
    m,
    "l-prov",
    {
      status: "completado",
      reference: "m1 https://rs/in-1 https://rs/out-1",
      receipt: {
        incomingPaymentId: "https://rs/in-1",
        outgoingPaymentId: "https://rs/out-1",
        quoteId: "https://rs/q-1",
        debitAmount: cop(300_100),
        receiveAmount: cop(300_000),
        grantSpentBefore: 0,
        grantSpentAfter: 300_100,
      },
    },
    now,
  );
  m = applyLineResult(m, "l-prod", { status: "en_cola", reference: "SIM-1" }, now);
  return applyLineResult(m, "l-fee", { status: "fallido", reference: null }, now);
};

describe("migrations", () => {
  it("run at initialize and leave nothing pending", async (ctx) => {
    expect(await db(ctx).showMigrations()).toBe(false);
  });
});

describe("TypeOrmMilestoneAdapter", () => {
  it("round-trips a milestone with its review, funding, line states and RF-23 receipts", async (ctx) => {
    const repo = new TypeOrmMilestoneAdapter(db(ctx));
    const milestone = busyMilestone();
    await repo.save(milestone);
    expect(await repo.findById("m1")).toEqual(milestone);
  });

  it("updates in place: saving again changes lines without duplicating them", async (ctx) => {
    const repo = new TypeOrmMilestoneAdapter(db(ctx));
    await repo.save(sampleMilestone());
    const paid = applyLineResult(sampleMilestone(), "l-prov", { status: "en_cola", reference: "SIM-2" }, now);
    await repo.save(paid);
    expect(await repo.findById("m1")).toEqual(paid);
    expect(await repo.findAll()).toHaveLength(1);
  });

  it("saves a milestone and its lines in one transaction: a failing line leaves the stored milestone untouched", async (ctx) => {
    const repo = new TypeOrmMilestoneAdapter(db(ctx));
    await repo.save(unfundedMilestone());
    const broken = fund(unfundedMilestone(), now);
    broken.lines[1] = { ...broken.lines[1], amount: 1.5 };
    await expect(repo.save(broken)).rejects.toThrow();
    expect((await repo.findById("m1"))?.fundedAt).toBeNull();
  });

  it("returns null for an unknown milestone", async (ctx) => {
    expect(await new TypeOrmMilestoneAdapter(db(ctx)).findById("nope")).toBeNull();
  });

  it("seeds only an empty table and keeps the seed order", async (ctx) => {
    const repo = new TypeOrmMilestoneAdapter(db(ctx));
    const seed = demoMilestones();
    await repo.seedIfEmpty(seed);
    await repo.seedIfEmpty([unfundedMilestone()]);
    expect((await repo.findAll()).map((m) => m.id)).toEqual(seed.map((m) => m.id));
  });
});

describe("TypeOrmGrantStore", () => {
  const key = randomBytes(32).toString("base64");
  const store = (ds: DataSource) => new TypeOrmGrantStore(ds, SecretCipher.fromBase64Key(key));
  const pendingGrant = (overrides: Partial<Grant> = {}): Grant => ({
    id: "8f8d3f5e-6d0e-4b8f-9d61-1f0a6c1b2a01",
    purpose: GRANT_PURPOSE.MILESTONE,
    projectId: null,
    milestoneId: "m1",
    payerWalletAddress: "https://ilp.test/custody",
    assetCode: "COP",
    assetScale: 2,
    debitLimit: 1_000_000,
    status: GRANT_STATUS.PENDING,
    pending: {
      clientNonce: "client-nonce-secret",
      finishNonce: "finish-nonce-secret",
      continueUri: "https://auth.test/continue/1",
      continueToken: "continue-token-secret",
      authServer: "https://auth.test",
    },
    access: null,
    createdAt: now,
    revokedAt: null,
    ...overrides,
  });
  const activeGrant = (): Grant => ({
    ...pendingGrant(),
    status: GRANT_STATUS.ACTIVE,
    pending: null,
    access: {
      accessToken: "access-token-secret",
      manageUrl: "https://auth.test/token/1",
      continueUri: "https://auth.test/continue/1",
      continueToken: "continue-token-2-secret",
    },
  });

  it("round-trips a pending grant, then the same grant once active", async (ctx) => {
    const ds = db(ctx);
    await new TypeOrmMilestoneAdapter(ds).save(unfundedMilestone());
    const grants = store(ds);

    await grants.save(pendingGrant());
    expect(await grants.findLatestForMilestone("m1")).toEqual(pendingGrant());

    await grants.save(activeGrant());
    expect(await grants.findLatestForMilestone("m1")).toEqual(activeGrant());
  });

  it("keeps every token and nonce encrypted at rest, with a distinct IV per value", async (ctx) => {
    const ds = db(ctx);
    await new TypeOrmMilestoneAdapter(ds).save(unfundedMilestone());
    await store(ds).save(pendingGrant());
    await store(ds).save({ ...activeGrant(), id: "8f8d3f5e-6d0e-4b8f-9d61-1f0a6c1b2a02", createdAt: new Date(now.getTime() + 1) });

    const raw = JSON.stringify(await ds.query("SELECT * FROM grants"));
    for (const secret of ["client-nonce-secret", "finish-nonce-secret", "continue-token-secret", "access-token-secret", "continue-token-2-secret"]) {
      expect(raw).not.toContain(secret);
    }
    const [row] = await ds.query("SELECT access_token_enc, continue_token_enc FROM grants WHERE status = 'active'");
    expect(row.access_token_enc).toMatch(/^v1\./);
    expect(row.access_token_enc.split(".")[1]).not.toBe(row.continue_token_enc.split(".")[1]);
  });

  it("returns the newest milestone grant", async (ctx) => {
    const ds = db(ctx);
    await new TypeOrmMilestoneAdapter(ds).save(unfundedMilestone());
    const newer = pendingGrant({ id: "8f8d3f5e-6d0e-4b8f-9d61-1f0a6c1b2a03", createdAt: new Date(now.getTime() + 60_000) });
    await store(ds).save(newer);
    await store(ds).save(pendingGrant());
    expect((await store(ds).findLatestForMilestone("m1"))?.id).toBe(newer.id);
    expect(await store(ds).findLatestForMilestone("other")).toBeNull();
  });

  it("refuses to read secrets sealed with another key", async (ctx) => {
    const ds = db(ctx);
    await new TypeOrmMilestoneAdapter(ds).save(unfundedMilestone());
    await store(ds).save(activeGrant());
    const foreign = new TypeOrmGrantStore(ds, SecretCipher.fromBase64Key(randomBytes(32).toString("base64")));
    await expect(foreign.findLatestForMilestone("m1")).rejects.toThrow();
  });
});

// Projects share this file (and its one dropSchema'd database): two specs resetting agro_test in parallel would race.
describe("TypeOrmProjectAdapter", () => {
  beforeEach(async () => {
    await dataSource?.query("TRUNCATE projects, project_code_sequences CASCADE");
  });

  const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
  const input = (): NewProjectInput => ({
    title: "Café Castillo",
    description: "Establecimiento de plantas",
    productionType: "CAFE_ESPECIAL",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-30",
    milestones: [
      {
        title: "Preparación",
        description: "Limpieza",
        estimatedCompletionDate: "2026-12-01",
        suppliesBudget: 3_200_000,
        laborBudget: 1_800_000,
        requirements: [
          { fieldKey: "soil_ph", label: "pH", type: "number", min: 4.5, max: 7 },
          { fieldKey: "ok", label: "Listo", type: "boolean_system_check" },
          { fieldKey: "photos", label: "Fotos", type: "photo_array", minItems: 1 },
        ],
      },
      { title: "Siembra", description: "Siembra", estimatedCompletionDate: "2027-01-15", suppliesBudget: 0, laborBudget: 900_000, requirements: [] },
    ],
  });
  const built = (id: string, owner = "u1", at = now) => buildProject({ id, ownerUserId: owner, input: input(), wallets, now: at });

  it("stores a project with its milestones and allocates AGR-YYYY-NNN per year", async (ctx) => {
    const ds = db(ctx);
    const projects = new TypeOrmProjectAdapter(ds);
    const a = built("p-a");
    const created = await projects.create(a.project, a.milestones);
    expect(created).toEqual({ ...a.project, projectCode: "AGR-2026-001" });
    expect(await projects.findById("p-a")).toEqual(created);

    const b = built("p-b", "u2");
    expect((await projects.create(b.project, b.milestones)).projectCode).toBe("AGR-2026-002");
    const c = built("p-c", "u1", new Date("2027-01-02T00:00:00Z"));
    expect((await projects.create(c.project, c.milestones)).projectCode).toBe("AGR-2027-001");

    expect((await projects.findByOwner("u1")).map((p) => p.id)).toEqual(["p-a", "p-c"]);
    expect(await projects.findById("nope")).toBeNull();
    expect(await new TypeOrmMilestoneAdapter(ds).findByProject("p-a")).toEqual(a.milestones);
  });

  it("writes project and milestones in one transaction: a failing milestone leaves no project and consumes no code", async (ctx) => {
    const ds = db(ctx);
    const projects = new TypeOrmProjectAdapter(ds);
    const broken = built("p-x");
    broken.milestones[1] = { ...broken.milestones[1], amount: 1.5 };
    await expect(projects.create(broken.project, broken.milestones)).rejects.toThrow();
    expect(await projects.findById("p-x")).toBeNull();
    const ok = built("p-y");
    expect((await projects.create(ok.project, ok.milestones)).projectCode).toBe("AGR-2026-001");
  });

  it("round-trips a project milestone with requirements, evidence logs and review history", async (ctx) => {
    const ds = db(ctx);
    const { project, milestones } = built("p-r");
    await new TypeOrmProjectAdapter(ds).create(project, milestones);
    const repo = new TypeOrmMilestoneAdapter(ds);
    let m = addEvidenceLog(milestones[0], milestones, { logType: "SOIL_ANALYSIS", notes: "Muestra", evidencePayload: { soil_ph: 5.5, ok: true, photos: ["https://f.test/1.jpg"] } }, now);
    m = submitForReview(m, milestones, now);
    m = review(m, "observado", "Falta foto", now);
    await repo.save(m);
    expect(await repo.findById(m.id)).toEqual(m);
    expect((await repo.findByProject("p-r")).map((x) => x.sequenceOrder)).toEqual([1, 2]);
  });

  it("keeps the legacy demo milestones projectless with empty PRD fields", async (ctx) => {
    const repo = new TypeOrmMilestoneAdapter(db(ctx));
    await repo.seedIfEmpty(demoMilestones());
    const [first] = await repo.findAll();
    expect(first).toMatchObject({ projectId: null, sequenceOrder: null, description: "", estimatedCompletionDate: null, requirements: [], evidenceLogs: [], reviews: [] });
  });
});
