import { ValidationError } from "../../../shared/domain-errors";
import { LINE_KIND } from "../../milestones/application/milestone";
import { FakeRepository } from "../../milestones/application/testing";
import { CreateProjectUseCase } from "./create-project.use-case";
import { buildProject, type NewProjectInput, validatePlotPolygon } from "./project";
import { ProducerWalletCheck } from "./producer-wallet";
import { FakeProjectRepository } from "./testing";

const wallets = { producer: "https://w.test/receiver", supplier: "https://w.test/receiver", platform: "https://w.test/receiver" };
const square = { type: "Polygon", coordinates: [[[-74.1, 4.6], [-74.0, 4.6], [-74.0, 4.7], [-74.1, 4.7], [-74.1, 4.6]]] };
const input = (extra: Partial<NewProjectInput> = {}): NewProjectInput => ({
  title: "Maíz P1",
  description: "Maíz en dos hectáreas",
  productionType: "OTRO",
  startDate: "2026-11-01",
  estimatedEndDate: "2027-03-30",
  milestones: [{ title: "Siembra", description: "Siembra", estimatedCompletionDate: "2026-12-01", suppliesBudget: 100, laborBudget: 200, requirements: [] }],
  ...extra,
});
const errorsOf = (fn: () => unknown) => {
  try {
    fn();
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors;
    throw error;
  }
};

describe("validatePlotPolygon (RF-01)", () => {
  it("accepts a closed GeoJSON Polygon ring of 4+ lon/lat positions", () => {
    expect(validatePlotPolygon(square)).toEqual({ polygon: square, error: null });
  });

  it.each([
    ["not a Polygon", { type: "Point", coordinates: [-74, 4] }],
    ["an open ring", { type: "Polygon", coordinates: [[[-74.1, 4.6], [-74.0, 4.6], [-74.0, 4.7], [-74.1, 4.7]]] }],
    ["fewer than 4 positions", { type: "Polygon", coordinates: [[[-74.1, 4.6], [-74.0, 4.6], [-74.1, 4.6]]] }],
    ["a longitude out of range", { type: "Polygon", coordinates: [[[-190, 4.6], [-74.0, 4.6], [-74.0, 4.7], [-190, 4.6]]] }],
    ["a latitude out of range", { type: "Polygon", coordinates: [[[-74.1, 95], [-74.0, 4.6], [-74.0, 4.7], [-74.1, 95]]] }],
    ["no rings", { type: "Polygon", coordinates: [] }],
  ])("rejects %s", (_, polygon) => {
    expect(validatePlotPolygon(polygon).error).toEqual(expect.any(String));
  });
});

describe("project intake: plot polygon and producer wallet (RF-01)", () => {
  it("keeps both optional: without them the project is as before", () => {
    const { project } = buildProject({ id: "p", ownerUserId: "u", input: input(), wallets, now: new Date() });
    expect(project).not.toHaveProperty("plotPolygon");
    expect(project).not.toHaveProperty("producerWalletAddress");
  });

  it("stores the polygon and pays the productor line to the producer's wallet instead of the receiver fallback", () => {
    const { project, milestones } = buildProject({
      id: "p",
      ownerUserId: "u",
      input: input({ plotPolygon: square, producerWalletAddress: "https://ilp.test/productor" }),
      wallets,
      now: new Date(),
    });
    expect(project).toMatchObject({ plotPolygon: square, producerWalletAddress: "https://ilp.test/productor" });
    expect(milestones[0].lines.find((l) => l.kind === LINE_KIND.PRODUCTOR)?.walletAddress).toBe("https://ilp.test/productor");
    expect(milestones[0].lines.find((l) => l.kind === LINE_KIND.PLATAFORMA)?.walletAddress).toBe("https://w.test/receiver");
  });

  it("reports a bad polygon and a non-https wallet on their own fields", () => {
    const errors = errorsOf(() =>
      buildProject({ id: "p", ownerUserId: "u", input: input({ plotPolygon: { type: "Polygon" } as never, producerWalletAddress: "http://x.test" }), wallets, now: new Date() }),
    );
    expect(Object.keys(errors).sort()).toEqual(["plotPolygon", "producerWalletAddress"]);
  });
});

class Wallets extends ProducerWalletCheck {
  checked: string[] = [];
  constructor(private readonly ok = true) {
    super();
  }
  async verify(url: string) {
    this.checked.push(url);
    if (!this.ok) throw new ValidationError({ producerWalletAddress: ["La billetera no recibe pesos colombianos (COP)."] });
  }
}

describe("CreateProjectUseCase with the producer wallet check (RF-01: validated with GET)", () => {
  const setup = (check?: ProducerWalletCheck) => {
    const projects = new FakeProjectRepository(new FakeRepository(new Map()));
    return { projects, create: new CreateProjectUseCase(projects, wallets, check) };
  };

  it("checks the wallet before storing anything", async () => {
    const check = new Wallets(false);
    const { create, projects } = setup(check);
    await expect(create.execute({ id: "u", role: "seller" }, input({ producerWalletAddress: "https://ilp.test/eur" }))).rejects.toThrow(ValidationError);
    expect(check.checked).toEqual(["https://ilp.test/eur"]);
    expect(await projects.findByOwner("u")).toEqual([]);
  });

  it("does not call the check without a wallet", async () => {
    const check = new Wallets();
    await setup(check).create.execute({ id: "u", role: "seller" }, input());
    expect(check.checked).toEqual([]);
  });

  it("creates the project once the wallet is accepted", async () => {
    const { create } = setup(new Wallets());
    const project = await create.execute({ id: "u", role: "seller" }, input({ producerWalletAddress: "https://ilp.test/cop" }));
    expect(project.producerWalletAddress).toBe("https://ilp.test/cop");
  });
});
