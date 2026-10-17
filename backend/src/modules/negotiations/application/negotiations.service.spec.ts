import { NotFoundError, RejectedError, ValidationError } from "../../../shared/domain-errors";
import { PROGRESS_STATUS, progressStatus } from "../../milestones/application/milestone-progress";
import { custodyGate } from "../../projects/application/project";
import { BUYER, type InstantCustody, OTHER_BUYER, PRODUCER, RedirectCustody, setup, TODAY } from "./testing";

const projectOffer = (overrides: Record<string, unknown> = {}) => ({
  scope: "PROJECT",
  buyer_id: "buyer-andina",
  buyer_name: "ignored",
  quantity: 10,
  unit: "TON",
  unit_price: 400_000,
  delivery_date: "2027-02-01",
  valid_until: "2026-10-30",
  notes: "Primera oferta",
  ...overrides,
});
const milestoneOffer = (milestoneId: string, overrides: Record<string, unknown> = {}) => ({
  scope: "MILESTONE",
  milestone_id: milestoneId,
  buyer_id: "buyer-andina",
  buyer_name: "ignored",
  price: 3_500_000,
  delivery_date: "2026-12-15",
  ...overrides,
});
const projectCounter = (overrides: Record<string, unknown> = {}) => ({
  author: "PRODUCER",
  quantity: 10,
  unit: "TON",
  unit_price: 450_000,
  delivery_date: "2027-02-01",
  valid_until: "2026-10-30",
  notes: "",
  ...overrides,
});

const rejection = async (work: Promise<unknown>) => {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  if (error instanceof RejectedError) return { status: 409, form: error.message };
  if (error instanceof ValidationError) return { status: 400, errors: error.fieldErrors };
  if (error instanceof NotFoundError) return { status: 404 };
  throw error ?? new Error("expected a rejection");
};

describe("NegotiationsService catalog", () => {
  it("lists every project that is not cancelled, with its producer and the derived locks", async () => {
    const { service, store } = setup();
    store.projects.set("gone", { ...store.projects.get("p1")!, id: "gone", currentStatus: "CANCELLED_OR_DISPUTED" });
    const [entry] = await service.catalog();
    expect(entry).toMatchObject({ producerName: PRODUCER.name, negotiationLocked: false, agreedMilestoneIds: [] });
    expect((await service.catalog()).map((e) => e.project.id)).toEqual(["p1"]);
    expect(await rejection(service.catalogProject("gone"))).toEqual({ status: 404 });
  });
});

describe("NegotiationsService start", () => {
  it("opens a PROJECT negotiation with the buyer's offer as revision 1; identity and names come from the caller, not the body", async () => {
    const { service } = setup();
    const r = await service.start("p1", BUYER, projectOffer());
    expect(r).toMatchObject({
      origin: "PROJECT_INTEREST",
      scope: "PROJECT",
      project_id: "p1",
      producer_id: PRODUCER.id,
      producer_name: PRODUCER.name,
      buyer_id: BUYER.id,
      buyer_name: BUYER.name,
      quantity: 10,
      status: "QUOTED",
    });
    expect(r.id).toMatch(/^qr-/);
    expect(r.quotes).toEqual([
      expect.objectContaining({ revision: 1, author: "BUYER", unit_price: 400_000, quantity: 10, unit: "TON", valid_until: "2026-10-30", status: "SENT" }),
    ]);
    expect(r.history).toEqual([expect.objectContaining({ actor: "BUYER", type: "OFFER", from: null, to: "QUOTED", payload: { revision: 1, unit_price: 400_000, quantity: 10, total: 4_000_000 } })]);
  });

  it("opens a MILESTONE negotiation as a lump sum: unit_price = price, quantity 1, no validity", async () => {
    const { service, built } = setup();
    const r = await service.start("p1", BUYER, milestoneOffer(built[0].id));
    expect(r).toMatchObject({ scope: "MILESTONE", milestone_id: built[0].id });
    expect(r.quotes[0]).toMatchObject({ unit_price: 3_500_000, quantity: 1 });
    expect(r.quotes[0].valid_until).toBeUndefined();
    expect(r.history[0].payload).toMatchObject({ price: 3_500_000 });
  });

  it("refuses like the mock: 404 project or milestone, 400 malformed or bad terms, 409 own project or duplicate", async () => {
    const { service } = setup();
    expect(await rejection(service.start("nope", BUYER, projectOffer()))).toEqual({ status: 404 });
    expect(await rejection(service.start("p1", BUYER, { scope: "PROJECT" }))).toEqual({ status: 400, errors: { _form: ["La solicitud no tiene el formato esperado."] } });
    expect(await rejection(service.start("p1", BUYER, milestoneOffer("nope")))).toEqual({ status: 404 });
    expect(await rejection(service.start("p1", BUYER, projectOffer({ valid_until: TODAY, unit: "LITRO" })))).toEqual({
      status: 400,
      errors: { unit: ["Selecciona la unidad."], validUntil: ["La vigencia debe ser posterior a hoy."] },
    });
    expect(await rejection(service.start("p1", PRODUCER, projectOffer()))).toEqual({ status: 409, form: "No puedes negociar sobre un proyecto propio." });
    await service.start("p1", BUYER, projectOffer());
    expect(await rejection(service.start("p1", BUYER, projectOffer()))).toEqual({ status: 409, form: "Ya tienes una negociación activa para este proyecto o hito." });
  });
});

describe("NegotiationsService counter", () => {
  it("follows the turn, supersedes the live offer and must change a term", async () => {
    const { service } = setup();
    const r = await service.start("p1", BUYER, projectOffer());
    expect(await rejection(service.counter(r.id, BUYER, projectCounter({ author: "BUYER" })))).toEqual({ status: 409, form: "Es el turno de la otra parte." });
    expect(await rejection(service.counter(r.id, PRODUCER, projectCounter({ unit_price: 400_000 })))).toEqual({
      status: 400,
      errors: { _form: ["La contraoferta debe cambiar al menos una condición."] },
    });
    const countered = await service.counter(r.id, PRODUCER, projectCounter());
    expect(countered.status).toBe("NEGOTIATING");
    expect(countered.quotes.map((q) => [q.revision, q.author, q.status])).toEqual([
      [1, "BUYER", "SUPERSEDED"],
      [2, "PRODUCER", "SENT"],
    ]);
    expect(countered.history.at(-1)).toMatchObject({ actor: "PRODUCER", type: "COUNTER_OFFER", from: "QUOTED", to: "NEGOTIATING" });
  });

  it("never lets a body speak for someone else: an author who is not the caller reads as not found", async () => {
    const { service } = setup();
    const r = await service.start("p1", BUYER, projectOffer());
    expect(await rejection(service.counter(r.id, OTHER_BUYER, projectCounter()))).toEqual({ status: 404 });
    expect(await rejection(service.get(r.id, [OTHER_BUYER]))).toEqual({ status: 404 });
    expect((await service.get(r.id, [OTHER_BUYER, PRODUCER])).id).toBe(r.id);
  });

  it("derives EXPIRED from valid_until against the injected clock", async () => {
    const { service, clock } = setup();
    const r = await service.start("p1", BUYER, projectOffer());
    clock.set("2026-11-02T15:00:00.000Z");
    expect(await rejection(service.counter(r.id, PRODUCER, projectCounter({ valid_until: "2026-11-30" })))).toEqual({ status: 409, form: "La oferta venció." });
    expect(await rejection(service.decide(r.id, 1, "accept", PRODUCER, { actor: "PRODUCER" }))).toEqual({ status: 409, form: "La oferta venció." });
    expect(await rejection(service.end(r.id, "withdraw", BUYER, { actor: "BUYER" }))).toEqual({ status: 409, form: "La oferta venció." });
  });
});

describe("NegotiationsService accept", () => {
  it("producer accepts a PROJECT offer: frozen quotation total, deposit PENDING, rivals auto-closed by SYSTEM", async () => {
    const { service, built, store } = setup();
    const rival = await service.start("p1", OTHER_BUYER, milestoneOffer(built[1].id, { price: 600_000 }));
    const r = await service.start("p1", BUYER, projectOffer());
    expect(await rejection(service.decide(r.id, 1, "accept", PRODUCER, { actor: "PRODUCER", expected_total: 1 }))).toEqual({
      status: 409,
      form: "El total de la cotización del proyecto cambió. Revisa el nuevo monto antes de depositar.",
    });

    const accepted = await service.decide(r.id, 1, "accept", PRODUCER, { actor: "PRODUCER" });
    expect(accepted).toMatchObject({ status: "ACCEPTED", agreed_total: 4_500_000, deposit_status: "PENDING" });
    expect(accepted.deposit_redirect_url).toBeUndefined();
    expect(accepted.quotes[0].status).toBe("ACCEPTED");
    expect(accepted.history.at(-1)).toMatchObject({ actor: "PRODUCER", type: "ACCEPT", payload: expect.objectContaining({ agreed_total: 4_500_000 }) });

    const closed = (await store.findNegotiation(rival.id))!;
    expect(closed.status).toBe("CANCELLED");
    expect(closed.quotes[0].status).toBe("WITHDRAWN");
    expect(closed.history.at(-1)).toMatchObject({ actor: "SYSTEM", type: "AUTO_CLOSE", payload: { reason: "PROJECT", agreed_negotiation_id: r.id } });
    expect((await service.catalogProject("p1")).negotiationLocked).toBe(true);
    expect(await rejection(service.start("p1", OTHER_BUYER, projectOffer()))).toEqual({ status: 409, form: "Este proyecto ya tiene un acuerdo: no admite nuevas negociaciones." });
  });

  it("an agreed milestone price replaces that milestone's budget in the project total", async () => {
    const { service, built } = setup();
    const m = await service.start("p1", BUYER, milestoneOffer(built[0].id));
    await service.decide(m.id, 1, "accept", PRODUCER, { actor: "PRODUCER" });
    expect((await service.catalogProject("p1")).agreedMilestoneIds).toEqual([built[0].id]);
    const r = await service.start("p1", BUYER, projectOffer());
    expect((await service.decide(r.id, 1, "accept", PRODUCER, { actor: "PRODUCER" })).agreed_total).toBe(3_500_000 + 500_000);
  });

  it("buyer accepts the producer's PROJECT counter: the deposit lands at once (simulated) and opens milestone 1", async () => {
    const { service, store, built, custody } = setup();
    const r = await service.start("p1", BUYER, projectOffer());
    await service.counter(r.id, PRODUCER, projectCounter());
    expect(await rejection(service.decide(r.id, 2, "accept", BUYER, { actor: "BUYER" }))).toEqual({ status: 400, errors: { expectedTotal: ["Confirma el total del depósito."] } });

    const done = await service.decide(r.id, 2, "accept", BUYER, { actor: "BUYER", expected_total: 4_500_000 });
    expect(done).toMatchObject({ status: "ACCEPTED", agreed_total: 4_500_000, deposit_status: "DEPOSITED", deposited_at: expect.any(String) });
    expect(done.history.at(-1)).toMatchObject({ actor: "BUYER", type: "DEPOSIT", from: "ACCEPTED", to: "ACCEPTED", payload: { amount: 4_500_000, currency: "COP", ledger_entry_id: done.ledger_entry_id } });
    expect((custody as InstantCustody).orders).toEqual([{ negotiationId: r.id, projectId: "p1", amount: 450_000_000, currency: "COP", assetScale: 2, buyerWalletAddress: null }]);

    expect(await service.ledger("p1", [BUYER])).toEqual([
      { id: done.ledger_entry_id, project_id: "p1", type: "CREDIT", category: "BUYER_DEPOSIT", amount: 4_500_000, currency: "COP", negotiation_id: r.id, buyer_id: BUYER.id, created_at: done.deposited_at, payment_reference: null },
    ]);
    const project = store.projects.get("p1")!;
    expect(project).toMatchObject({ custodyBalance: 450_000_000, currentStatus: "FUNDED_IN_CUSTODY" });
    expect(progressStatus(built[0], built, custodyGate(project))).toBe(PROGRESS_STATUS.ACTIVE);
    expect(progressStatus(built[1], built, custodyGate(project))).toBe(PROGRESS_STATUS.LOCKED);
  });

  it("rejecting the latest offer ends the negotiation; an older revision is refused", async () => {
    const { service } = setup();
    const r = await service.start("p1", BUYER, projectOffer());
    await service.counter(r.id, PRODUCER, projectCounter());
    expect(await rejection(service.decide(r.id, 1, "accept", BUYER, null))).toEqual({ status: 409, form: "Esta oferta ya fue superada por una contraoferta." });
    expect(await rejection(service.decide(r.id, 9, "accept", BUYER, null))).toEqual({ status: 404 });
    expect((await service.decide(r.id, 2, "reject", BUYER, null)).status).toBe("REJECTED");
  });
});

describe("NegotiationsService deposit", () => {
  const agreed = async (custody = new RedirectCustody()) => {
    const ctx = setup(custody);
    const r = await ctx.service.start("p1", BUYER, projectOffer());
    await ctx.service.decide(r.id, 1, "accept", PRODUCER, { actor: "PRODUCER" });
    return { ...ctx, id: r.id };
  };

  it("checks in the mock's order: malformed, owner, missing total, stale total", async () => {
    const { service, id } = await agreed();
    expect(await rejection(service.deposit("nope", BUYER, { buyer_id: "x" }))).toEqual({ status: 404 });
    expect(await rejection(service.deposit(id, BUYER, {}))).toEqual({ status: 400, errors: { _form: ["La solicitud no tiene el formato esperado."] } });
    expect(await rejection(service.deposit(id, OTHER_BUYER, { buyer_id: "buyer-andina", expected_total: 4_500_000 }))).toEqual({ status: 409, form: "Solo el comprador de este acuerdo puede depositar." });
    expect(await rejection(service.deposit(id, BUYER, { buyer_id: "x" }))).toEqual({ status: 400, errors: { expectedTotal: ["Confirma el total del depósito."] } });
    expect(await rejection(service.deposit(id, BUYER, { buyer_id: "x", expected_total: 1 }))).toEqual({
      status: 409,
      form: "El total de la cotización del proyecto cambió. Revisa el nuevo monto antes de depositar.",
    });
  });

  it("only agreed PROJECT negotiations have a deposit", async () => {
    const { service, built } = setup();
    const m = await service.start("p1", BUYER, milestoneOffer(built[0].id));
    expect(await rejection(service.deposit(m.id, BUYER, { buyer_id: "x", expected_total: 1 }))).toEqual({ status: 409, form: "Solo los acuerdos del proyecto tienen depósito." });
    const r = await service.start("p1", BUYER, projectOffer());
    expect(await rejection(service.deposit(r.id, BUYER, { buyer_id: "x", expected_total: 1 }))).toEqual({ status: 409, form: "Esta negociación no tiene un depósito pendiente." });
  });

  it("Open Payments: answers PENDING with the wallet consent URL; the verified callback deposits once", async () => {
    const { service, store, id } = await agreed();
    const pending = await service.deposit(id, BUYER, { buyer_id: "x", expected_total: 4_500_000 });
    expect(pending).toMatchObject({ deposit_status: "PENDING", deposit_redirect_url: `https://wallet.test/consent/${id}` });
    expect(store.ledger).toEqual([]);

    await expect(service.completeDeposit(id, { interactRef: "r", hash: "bad" })).rejects.toThrow("hash mismatch");
    expect((await store.findNegotiation(id))?.deposit_status).toBe("PENDING");

    const done = await service.completeDeposit(id, { interactRef: "r", hash: "good" });
    expect(done.deposit_status).toBe("DEPOSITED");
    expect(store.ledger).toEqual([expect.objectContaining({ amount: 4_500_000, payment_reference: "https://rs.test/outgoing-payments/out-1" })]);
    expect(store.projects.get("p1")).toMatchObject({ custodyBalance: 450_000_000, currentStatus: "FUNDED_IN_CUSTODY" });

    expect(await rejection(service.completeDeposit(id, { interactRef: "r", hash: "good" }))).toEqual({ status: 409, form: "Esta negociación no tiene un depósito pendiente." });
    expect(await rejection(service.deposit(id, BUYER, { buyer_id: "x", expected_total: 4_500_000 }))).toEqual({ status: 409, form: "El depósito ya se realizó." });
  });

  it("Open Payments: a BUYER accept on a PROJECT offer starts the deposit and returns the consent URL", async () => {
    const { service } = setup(new RedirectCustody());
    const r = await service.start("p1", BUYER, projectOffer());
    await service.counter(r.id, PRODUCER, projectCounter());
    const accepted = await service.decide(r.id, 2, "accept", BUYER, { actor: "BUYER", expected_total: 4_500_000 });
    expect(accepted).toMatchObject({ status: "ACCEPTED", deposit_status: "PENDING", deposit_redirect_url: `https://wallet.test/consent/${r.id}` });
  });
});

describe("NegotiationsService end", () => {
  it("cancel is the buyer's, decline the producer's, withdraw either's; the live offer is withdrawn with it", async () => {
    const { service } = setup();
    const a = await service.start("p1", BUYER, projectOffer());
    expect(await rejection(service.end(a.id, "decline", PRODUCER, null))).toEqual({ status: 409, form: "Esta acción ya no está disponible para la negociación." });
    const withdrawn = await service.end(a.id, "withdraw", PRODUCER, { actor: "PRODUCER" });
    expect(withdrawn).toMatchObject({ status: "CANCELLED" });
    expect(withdrawn.quotes[0].status).toBe("WITHDRAWN");
    expect(withdrawn.history.at(-1)).toMatchObject({ actor: "PRODUCER", type: "WITHDRAW", from: "QUOTED", to: "CANCELLED" });
    expect(await rejection(service.end(a.id, "withdraw", BUYER, null))).toEqual({ status: 409, form: "Esta acción ya no está disponible para la negociación." });
  });
});

describe("NegotiationsService lists", () => {
  it("a buyer reads only their own list; a producer only theirs, optionally by project", async () => {
    const { service } = setup();
    const r = await service.start("p1", BUYER, projectOffer());
    expect((await service.listForBuyer(BUYER.id, BUYER)).map((n) => n.id)).toEqual([r.id]);
    expect(await service.listForBuyer(BUYER.id, OTHER_BUYER)).toEqual([]);
    expect((await service.listForProducer(PRODUCER, "p1")).map((n) => n.id)).toEqual([r.id]);
    expect(await service.listForProducer(OTHER_BUYER, undefined, PRODUCER.id)).toEqual([]);
  });
});

describe("NegotiationsService open requests", () => {
  const openRequest = (overrides: Record<string, unknown> = {}) => ({
    buyer_id: "buyer-andina",
    buyer_name: "ignored",
    title: "Café pergamino",
    production_type: "CAFE_ESPECIAL",
    quantity: 20,
    unit: "TON",
    delivery_date: "2027-01-30",
    delivery_location: "Medellín",
    notes: "",
    ...overrides,
  });
  const offer = (overrides: Record<string, unknown> = {}) => ({
    project_id: "p1",
    producer_id: "producer-main",
    producer_name: "ignored",
    unit_price: 9_000_000,
    quantity: 15,
    valid_until: "2026-10-30",
    delivery_terms: "Entrega en bodega",
    ...overrides,
  });

  it("creates, offers against it and derives the awarded quantity from accepted offers", async () => {
    const { service } = setup();
    const created = await service.createOpenRequest(BUYER, openRequest());
    expect(created).toMatchObject({ buyer_id: BUYER.id, buyer_name: BUYER.name, status: "OPEN", currency: "COP", awarded_quantity: 0 });
    expect(await rejection(service.createOpenRequest(BUYER, openRequest({ title: "x" })))).toEqual({ status: 400, errors: { title: ["El título debe tener al menos 3 caracteres."] } });

    expect(await rejection(service.startOnOpenRequest(created.id, OTHER_BUYER, offer()))).toEqual({ status: 409, form: "El proyecto elegido no pertenece a este productor." });
    expect(await rejection(service.startOnOpenRequest(created.id, PRODUCER, offer({ quantity: 21 })))).toEqual({
      status: 400,
      errors: { quantity: ["Supera la cantidad pendiente por asignar (20)."] },
    });
    const n = await service.startOnOpenRequest(created.id, PRODUCER, offer());
    expect(n).toMatchObject({ origin: "OPEN_REQUEST", open_request_id: created.id, producer_id: PRODUCER.id, buyer_id: BUYER.id, quantity: 15 });
    expect(n.scope).toBeUndefined();
    expect(await rejection(service.startOnOpenRequest(created.id, PRODUCER, offer()))).toEqual({ status: 409, form: "Ya tienes una negociación activa en esta solicitud." });

    await service.decide(n.id, 1, "accept", BUYER, null);
    expect((await service.getOpenRequest(created.id)).awarded_quantity).toBe(15);
    expect((await service.openRequestNegotiations(created.id)).map((x) => x.id)).toEqual([n.id]);
    expect((await service.listBuyerOpenRequests(BUYER.id, BUYER)).map((o) => o.id)).toEqual([created.id]);
  });

  it("closes once, and only for its buyer", async () => {
    const { service } = setup();
    const created = await service.createOpenRequest(BUYER, openRequest());
    expect(await rejection(service.closeOpenRequest(created.id, OTHER_BUYER))).toEqual({ status: 404 });
    expect((await service.closeOpenRequest(created.id, BUYER)).status).toBe("CLOSED");
    expect(await rejection(service.closeOpenRequest(created.id, BUYER))).toEqual({ status: 409, form: "La solicitud abierta ya está cerrada." });
    expect(await rejection(service.startOnOpenRequest(created.id, PRODUCER, offer()))).toEqual({ status: 409, form: "Esta solicitud abierta está cerrada: no admite nuevas negociaciones." });
    expect((await service.listOpenRequests("OPEN")).length).toBe(0);
  });
});
