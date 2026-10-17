// Runs the real migrations against a throwaway local database (agro_test, never the dev one); skips when it is unreachable.
import { randomBytes } from "node:crypto";
import { DataSource } from "typeorm";
import { SecretCipher } from "../../../../shared/crypto/secret-cipher";
import { MIGRATIONS } from "../../../../shared/database/migrations";
import { buildProject, type NewProjectInput } from "../../../projects/application/project";
import { PROJECT_ENTITIES } from "../../../projects/infrastructure/persistence/entities";
import { TypeOrmProjectAdapter } from "../../../projects/infrastructure/persistence/typeorm-project.adapter";
import { applyPayoutResult, approveSettlement, startExecution } from "../../../settlement/application/settlement";
import { sampleSettlement } from "../../../settlement/application/testing";
import { TypeOrmSettlementAdapter } from "../../../settlement/infrastructure/persistence/typeorm-settlement.adapter";
import { addEvidenceLog, submitForReview } from "../../application/milestone-progress";
import { applyLineResult, fund, type Milestone, review, submitEvidence } from "../../application/milestone";
import { sampleMilestone, unfundedMilestone } from "../../application/testing";
import { type Grant, GRANT_PURPOSE, GRANT_STATUS } from "../../ports/grant-store";
import { demoMilestones } from "../demo-milestones";
import { MILESTONE_ENTITIES } from "./entities";
import { TypeOrmGrantStore } from "./typeorm-grant-store.adapter";
import { TypeOrmMilestoneAdapter } from "./typeorm-milestone.adapter";
import { NegotiationsService } from "../../../negotiations/application/negotiations.service";
import { BUYER, FakeDirectory, InstantCustody, PRODUCER } from "../../../negotiations/application/testing";
import { TypeOrmNegotiationStore } from "../../../negotiations/infrastructure/persistence/typeorm-negotiation-store.adapter";
import { InvestmentUseCases } from "../../../investments/application/investments.use-cases";
import { FakeCapture, INVESTOR, OTHER_INVESTOR, EUR_WALLET, eurQuote } from "../../../investments/application/testing";
import { TypeOrmInvestmentStore } from "../../../investments/infrastructure/persistence/typeorm-investment-store.adapter";

const url = process.env.TEST_DATABASE_URL ?? "postgres://agro:agro@localhost:5432/agro_test";
// dropSchema wipes the database: refuse anything that is not a *_test (or *_test_<worktree>) database.
if (!/_test(_\w+)?$/.test(new URL(url).pathname)) throw new Error(`Refusing to run persistence specs against ${new URL(url).pathname}`);

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

// Block 3: negotiations, their offers and history, the custody ledger and open requests, through the real service.
describe("TypeOrmNegotiationStore", () => {
  beforeEach(async () => {
    await dataSource?.query("TRUNCATE projects, project_code_sequences, open_requests CASCADE");
  });

  const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
  const clock = { now: () => new Date("2026-10-17T15:00:00.000Z") };
  async function seeded(ds: DataSource) {
    const { project, milestones } = buildProject({
      id: "p-n",
      ownerUserId: PRODUCER.id,
      now,
      wallets,
      input: {
        title: "Café Castillo",
        description: "Establecimiento de plantas",
        productionType: "CAFE_ESPECIAL",
        startDate: "2026-11-01",
        estimatedEndDate: "2027-03-30",
        milestones: [
          { title: "Preparación", description: "Limpieza", estimatedCompletionDate: "2026-12-01", suppliesBudget: 3_000_000, laborBudget: 1_000_000, requirements: [] },
          { title: "Siembra", description: "Siembra", estimatedCompletionDate: "2027-01-15", suppliesBudget: 0, laborBudget: 500_000, requirements: [] },
        ],
      },
    });
    await new TypeOrmProjectAdapter(ds).create(project, milestones);
    const store = new TypeOrmNegotiationStore(ds);
    const service = new NegotiationsService(store, new TypeOrmMilestoneAdapter(ds), new FakeDirectory([PRODUCER, BUYER]), new InstantCustody(), clock);
    return { store, service, milestones };
  }
  const offer = {
    scope: "PROJECT",
    buyer_id: "x",
    buyer_name: "x",
    quantity: 10,
    unit: "TON",
    unit_price: 400_000,
    delivery_date: "2027-02-01",
    valid_until: "2026-10-30",
  };

  it("round-trips a negotiation through counter, accept, auto-close and deposit, and commits the custody effects", async (ctx) => {
    const { store, service, milestones } = await seeded(db(ctx));
    const rival = await service.start("p-n", BUYER, { scope: "MILESTONE", milestone_id: milestones[1].id, buyer_id: "x", buyer_name: "x", price: 600_000, delivery_date: "2026-12-15" });
    expect(await store.findNegotiation(rival.id)).toEqual(rival);
    await service.end(rival.id, "withdraw", BUYER, null);

    const started = await service.start("p-n", BUYER, offer);
    expect(await store.findNegotiation(started.id)).toEqual(started);
    await service.counter(started.id, PRODUCER, { ...offer, author: "PRODUCER", unit_price: 450_000, notes: "Contraoferta" });
    const done = await service.decide(started.id, 2, "accept", BUYER, { actor: "BUYER", expected_total: 4_500_000 });

    expect(await store.findNegotiation(started.id)).toEqual(done);
    expect(done).toMatchObject({ status: "ACCEPTED", agreed_total: 4_500_000, deposit_status: "DEPOSITED" });
    expect(done.history.map((h) => h.type)).toEqual(["OFFER", "COUNTER_OFFER", "ACCEPT", "DEPOSIT"]);
    expect(await store.listLedger("p-n")).toEqual([expect.objectContaining({ id: done.ledger_entry_id, amount: 4_500_000, buyer_id: BUYER.id, negotiation_id: started.id })]);
    expect(await store.findProject("p-n")).toMatchObject({ custodyBalance: 450_000_000, currentStatus: "FUNDED_IN_CUSTODY" });
    expect((await store.listNegotiations({ buyerId: BUYER.id })).map((n) => n.id)).toEqual([rival.id, started.id]);
    expect((await store.listNegotiations({ producerId: PRODUCER.id, projectId: "p-n" })).length).toBe(2);
  });

  it("rolls the whole deposit back when one write fails, and never books two credits for one negotiation", async (ctx) => {
    const { store, service } = await seeded(db(ctx));
    const started = await service.start("p-n", BUYER, offer);
    const before = await store.findNegotiation(started.id);
    const entry = { id: "led-1", project_id: "p-n", type: "CREDIT", category: "BUYER_DEPOSIT", amount: 1, currency: "COP", negotiation_id: started.id, buyer_id: BUYER.id, created_at: now.toISOString(), payment_reference: null };
    await expect(
      store.transaction("p-n", async (tx) => {
        await tx.saveNegotiation({ ...before!, deposit_status: "DEPOSITED" });
        await tx.creditCustody("p-n", 100);
        await tx.addLedgerEntry({ ...entry, amount: 0 });
      }),
    ).rejects.toThrow();
    expect(await store.findNegotiation(started.id)).toEqual(before);
    expect(await store.findProject("p-n")).toMatchObject({ custodyBalance: 0, currentStatus: "DRAFT" });

    await store.addLedgerEntry(entry);
    await expect(store.addLedgerEntry({ ...entry, id: "led-2" })).rejects.toThrow();
  });

  it("round-trips open requests and their negotiations; awarded quantity is derived", async (ctx) => {
    const { store, service } = await seeded(db(ctx));
    const created = await service.createOpenRequest(BUYER, {
      buyer_id: "x",
      buyer_name: "x",
      title: "Café pergamino",
      production_type: "CAFE_ESPECIAL",
      quantity: 20,
      unit: "TON",
      target_unit_price: 8_000_000,
      delivery_date: "2027-01-30",
      delivery_location: "Medellín",
      notes: "",
    });
    const { awarded_quantity: _, ...record } = created;
    expect(await store.findOpenRequest(created.id)).toEqual(record);
    const n = await service.startOnOpenRequest(created.id, PRODUCER, { project_id: "p-n", producer_id: "x", producer_name: "x", unit_price: 9_000_000, quantity: 15, valid_until: "2026-10-30", delivery_terms: "Entrega en bodega" });
    expect(await store.findNegotiation(n.id)).toEqual(n);
    await service.decide(n.id, 1, "accept", BUYER, null);
    expect((await service.getOpenRequest(created.id)).awarded_quantity).toBe(15);
    await service.closeOpenRequest(created.id, BUYER);
    expect((await store.listOpenRequests({ status: "CLOSED", buyerId: BUYER.id })).map((o) => o.id)).toEqual([created.id]);
  });

  it("stores buyer_deposit grants by negotiation, apart from milestone grants", async (ctx) => {
    const ds = db(ctx);
    const { service } = await seeded(ds);
    const started = await service.start("p-n", BUYER, offer);
    const grants = new TypeOrmGrantStore(ds, SecretCipher.fromBase64Key(randomBytes(32).toString("base64")));
    const grant: Grant = {
      id: "8f8d3f5e-6d0e-4b8f-9d61-1f0a6c1b2a09",
      purpose: GRANT_PURPOSE.BUYER_DEPOSIT,
      projectId: "p-n",
      milestoneId: null,
      negotiationId: started.id,
      payerWalletAddress: "https://ilp.test/buyer",
      assetCode: "COP",
      assetScale: 2,
      debitLimit: 454_500_000,
      status: GRANT_STATUS.PENDING,
      pending: { clientNonce: "n", finishNonce: "f", continueUri: "https://auth.test/continue", continueToken: "t", authServer: "https://auth.test" },
      access: null,
      createdAt: now,
      revokedAt: null,
    };
    await grants.save(grant);
    expect(await grants.findLatestForNegotiation(started.id)).toEqual(grant);
    expect(await grants.findLatestForNegotiation("other")).toBeNull();
  });
});

describe("TypeOrmSettlementAdapter", () => {
  const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
  const input: NewProjectInput = {
    title: "Tomate bajo invernadero",
    description: "Ciclo de 120 días",
    productionType: "OTRO",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-01",
    milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100, laborBudget: 200, requirements: [] }],
  };

  beforeEach(async () => {
    await dataSource?.query("TRUNCATE projects, project_code_sequences CASCADE");
    if (!dataSource) return;
    const { project, milestones } = buildProject({ id: "p1", ownerUserId: "u1", input, wallets, now });
    await new TypeOrmProjectAdapter(dataSource).create(project, milestones);
  });

  it("round-trips a settlement with its plan snapshot, payout states and RF-23 receipts", async (ctx) => {
    const repo = new TypeOrmSettlementAdapter(db(ctx));
    await repo.save(sampleSettlement());
    expect(await repo.findById("s1")).toEqual(sampleSettlement());

    let s = startExecution(approveSettlement(sampleSettlement(), "u-fidu", now));
    s = applyPayoutResult(s, "producer", { status: "completado", reference: "SIM-1", receipt: { debitAmount: cop(37_400_000), receiveAmount: cop(37_300_000) } }, now);
    s = applyPayoutResult(s, "investor-inv-eur", { status: "en_cola", reference: "SIM-2", receipt: { debitAmount: cop(56_400_000) } }, now);
    s = applyPayoutResult(s, "platform", { status: "fallido", reference: null }, now);
    await repo.save(s);
    expect(await repo.findById("s1")).toEqual(s);
    expect((await repo.findByProject("p1")).map((x) => x.id)).toEqual(["s1"]);
    expect(await repo.findById("nope")).toBeNull();
  });

  it("moves the project status", async (ctx) => {
    const projects = new TypeOrmProjectAdapter(db(ctx));
    await projects.updateStatus("p1", "SETTLEMENT_PROCESSING");
    expect((await projects.findById("p1"))?.currentStatus).toBe("SETTLEMENT_PROCESSING");
  });

  it("allows at most one approved, executing or executed settlement per project", async (ctx) => {
    const repo = new TypeOrmSettlementAdapter(db(ctx));
    await repo.save(approveSettlement(sampleSettlement(), "u-fidu", now));
    const other = { ...approveSettlement(sampleSettlement(), "u-fidu", now), id: "s2" };
    await expect(repo.save(other)).rejects.toThrow();
    await repo.save({ ...sampleSettlement(), id: "s3" });
    expect((await repo.findByProject("p1")).map((x) => x.id)).toEqual(["s1", "s3"]);
  });
});

// Block 4: investor capture through the real use cases, store and migrations (the capture itself is scripted).
describe("TypeOrmInvestmentStore", () => {
  const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
  // Target 300.000 pesos: the 10 % cap is 30.000 pesos (3.000.000 minor) per investor.
  const input: NewProjectInput = {
    title: "Cacao fino",
    description: "Ciclo de cacao",
    productionType: "CACAO",
    startDate: "2026-11-01",
    estimatedEndDate: "2027-03-01",
    milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100_000, laborBudget: 200_000, requirements: [] }],
  };

  beforeEach(async () => {
    await dataSource?.query("TRUNCATE projects, project_code_sequences CASCADE");
    if (!dataSource) return;
    const { project, milestones } = buildProject({ id: "p-i", ownerUserId: "u-prod", input, wallets, now });
    await new TypeOrmProjectAdapter(dataSource).create(project, milestones);
  });

  const wire = (ds: DataSource) => {
    const store = new TypeOrmInvestmentStore(ds);
    const capture = new FakeCapture();
    return { store, capture, useCases: new InvestmentUseCases(store, capture, { now: () => now }) };
  };

  it("round-trips a captured investment with its quote and rate, and commits the ledger credit, custody balance and status", async (ctx) => {
    const { store, useCases } = wire(db(ctx));
    const done = await useCases.invest("p-i", INVESTOR, { amount: 3_000_000, walletAddress: EUR_WALLET.id });
    const stored = await store.findById(done.id);
    expect(stored).toEqual({ ...done, consentRedirectUrl: undefined, quote: eurQuote({ receiveAmount: 3_000_000 }) });
    expect(stored?.impliedRate).toBe("4000/3");
    const ledger = await new TypeOrmNegotiationStore(db(ctx)).listLedger("p-i");
    expect(ledger).toEqual([
      { id: expect.any(String), project_id: "p-i", type: "CREDIT", category: "INVESTOR_CAPITAL", amount: 30_000, currency: "COP", investment_id: done.id, payment_reference: `SIM-${done.id}`, created_at: now.toISOString() },
    ]);
    expect(await store.findProject("p-i")).toMatchObject({ custodyBalance: 3_000_000, currentStatus: "FUNDING_IN_PROGRESS" });
  });

  it("never books two credits for one investment", async (ctx) => {
    const { store, useCases } = wire(db(ctx));
    const done = await useCases.invest("p-i", INVESTOR, { amount: 1_000_000, walletAddress: EUR_WALLET.id });
    const credit = { id: "led-dup", projectId: "p-i", investmentId: done.id, amount: 10_000, currency: "COP", paymentReference: null, createdAt: now.toISOString() };
    await expect(store.transaction("p-i", (tx) => tx.creditCapital(credit, 1_000_000, "FUNDING_IN_PROGRESS"))).rejects.toThrow();
    expect((await store.findProject("p-i"))?.custodyBalance).toBe(1_000_000);
  });

  it("serializes subscriptions on the project row: two consents at once by one investor, one is refused", async (ctx) => {
    const { store, capture, useCases } = wire(db(ctx));
    capture.mode = "consent";
    const results = await Promise.allSettled([1, 2].map(() => useCases.invest("p-i", INVESTOR, { amount: 1_000_000, walletAddress: EUR_WALLET.id })));
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    await useCases.invest("p-i", OTHER_INVESTOR, { amount: 1_000_000, walletAddress: EUR_WALLET.id });
    expect((await store.listByProject("p-i")).map((i) => i.status)).toEqual(["PENDING_CONSENT", "PENDING_CONSENT"]);
  });

  it("stores investor_capture grants by investment", async (ctx) => {
    const { useCases, capture } = wire(db(ctx));
    capture.mode = "consent";
    const pending = await useCases.invest("p-i", INVESTOR, { amount: 1_000_000, walletAddress: EUR_WALLET.id });
    const grants = new TypeOrmGrantStore(db(ctx), SecretCipher.fromBase64Key(randomBytes(32).toString("base64")));
    const grant: Grant = {
      id: "00000000-0000-4000-8000-0000000000c1",
      purpose: GRANT_PURPOSE.INVESTOR_CAPTURE,
      projectId: "p-i",
      milestoneId: null,
      investmentId: pending.id,
      payerWalletAddress: EUR_WALLET.id,
      assetCode: "EUR",
      assetScale: 2,
      debitLimit: 2_250,
      status: GRANT_STATUS.PENDING,
      pending: { clientNonce: "n", finishNonce: "f", continueUri: "https://auth.test/continue", continueToken: "t", authServer: "https://auth.test" },
      access: null,
      createdAt: now,
      revokedAt: null,
    };
    await grants.save(grant);
    expect(await grants.findLatestForInvestment(pending.id)).toEqual(grant);
    expect(await grants.findLatestForMilestone("p-i")).toBeNull();
  });
});
