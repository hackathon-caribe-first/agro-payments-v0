import { DomainError, ValidationError } from "../../../shared/domain-errors";
import { LINE_KIND } from "../../milestones/application/milestone";
import {
  buildProject,
  canView,
  formatProjectCode,
  minorToPesos,
  type NewProjectInput,
  PLATFORM_FEE_PCT,
  platformFee,
  pesosToMinor,
  PROJECT_STATUS,
  validateNewProject,
} from "./project";

const wallets = { producer: "https://w.test/prod", supplier: "https://w.test/prov", platform: "https://w.test/fee" };
const now = new Date("2026-10-16T12:00:00Z");

const validInput = (): NewProjectInput => ({
  title: "Café Castillo",
  description: "Establecimiento de 1.500 plantas",
  productionType: "CAFE_ESPECIAL",
  startDate: "2026-11-01",
  estimatedEndDate: "2027-03-30",
  milestones: [
    { title: "Preparación", description: "Limpieza", estimatedCompletionDate: "2026-12-01", suppliesBudget: 3_200_000, laborBudget: 1_800_000, requirements: [] },
    { title: "Siembra", description: "Siembra", estimatedCompletionDate: "2027-01-15", suppliesBudget: 0, laborBudget: 1_000_001, requirements: [] },
  ],
});

const errorsOf = (input: unknown) => {
  try {
    validateNewProject(input as NewProjectInput);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return error.fieldErrors;
    throw error;
  }
};

describe("formatProjectCode", () => {
  it("formats AGR-YYYY-NNN, padding to three digits", () => {
    expect(formatProjectCode(2026, 1)).toBe("AGR-2026-001");
    expect(formatProjectCode(2026, 42)).toBe("AGR-2026-042");
    expect(formatProjectCode(2027, 1234)).toBe("AGR-2027-1234");
  });
});

describe("money at the /api boundary", () => {
  it("converts whole pesos to minor units and back", () => {
    expect(pesosToMinor(3_200_000, 2)).toBe(320_000_000);
    expect(minorToPesos(320_000_000, 2)).toBe(3_200_000);
    expect(pesosToMinor(0, 2)).toBe(0);
  });

  it("refuses fractional, negative and unsafe pesos", () => {
    expect(() => pesosToMinor(10.5, 2)).toThrow(DomainError);
    expect(() => pesosToMinor(-1, 2)).toThrow(DomainError);
    expect(() => pesosToMinor(Number.MAX_SAFE_INTEGER, 2)).toThrow(DomainError);
  });
});

describe("platformFee", () => {
  it("is PRD v3 D-06: 3 %", () => {
    expect(PLATFORM_FEE_PCT).toBe(3);
  });

  it("rounds half down in minor units", () => {
    expect(platformFee(500_000_000, 3)).toBe(15_000_000);
    expect(platformFee(150, 3)).toBe(4); // 4.5 → 4
    expect(platformFee(151, 3)).toBe(5); // 4.53 → 5
    expect(platformFee(149, 3)).toBe(4); // 4.47 → 4
    expect(platformFee(10, 3)).toBe(0);
  });
});

describe("validateNewProject", () => {
  it("accepts a valid draft and trims the texts", () => {
    const input = validInput();
    expect(validateNewProject({ ...input, title: "  Café Castillo  " }).title).toBe("Café Castillo");
  });

  it("keys errors by camelCase field path, like the web app's schema", () => {
    const input = validInput();
    expect(
      errorsOf({
        ...input,
        title: "ab",
        description: "corta",
        productionType: "PAPA",
        milestones: [{ ...input.milestones[0], title: "", suppliesBudget: 1.5, laborBudget: -1 }],
      }),
    ).toEqual({
      title: ["El nombre debe tener al menos 3 caracteres."],
      description: ["La descripción debe tener al menos 10 caracteres."],
      productionType: ["Selecciona un tipo de producción."],
      "milestones.0.title": ["El nombre debe tener al menos 3 caracteres."],
      "milestones.0.suppliesBudget": ["Insumos: ingresa un valor entero en pesos."],
      "milestones.0.laborBudget": ["Mano de obra: no puede ser negativo."],
    });
  });

  it("needs at least one milestone and valid ISO dates", () => {
    expect(errorsOf({ ...validInput(), startDate: "2026-02-30", milestones: [] })).toEqual({
      startDate: ["Ingresa una fecha de inicio válida."],
      milestones: ["Agrega al menos un hito."],
    });
  });

  it("checks the end date before the milestone dates", () => {
    expect(errorsOf({ ...validInput(), estimatedEndDate: "2026-10-01" })).toEqual({
      estimatedEndDate: ["La fecha de finalización debe ser igual o posterior al inicio."],
    });
  });

  it("keeps each milestone date within the project and its quotation above zero", () => {
    const input = validInput();
    const milestones = [input.milestones[0], { ...input.milestones[1], estimatedCompletionDate: "2027-04-01", suppliesBudget: 0, laborBudget: 0 }];
    expect(errorsOf({ ...input, milestones })).toEqual({
      "milestones.1.estimatedCompletionDate": ["La fecha debe estar dentro del periodo del proyecto."],
      "milestones.1.laborBudget": ["La cotización del hito debe ser mayor a cero."],
    });
  });

  it("requires labor above zero: every milestone pays exactly one productor line (server-only rule)", () => {
    const input = validInput();
    const milestones = [{ ...input.milestones[0], laborBudget: 0 }];
    expect(errorsOf({ ...input, milestones })).toEqual({
      "milestones.0.laborBudget": ["Mano de obra: debe ser mayor a cero para pagar al productor."],
    });
  });
});

describe("buildProject", () => {
  const built = () => buildProject({ id: "p1", ownerUserId: "u1", input: validInput(), wallets, now });

  it("sets the PRD defaults: DRAFT, COP, 3 % fee, zero balances, target = Σ(supplies + labor) in minor units", () => {
    const { project } = built();
    expect(project).toEqual({
      id: "p1",
      ownerUserId: "u1",
      title: "Café Castillo",
      description: "Establecimiento de 1.500 plantas",
      productionType: "CAFE_ESPECIAL",
      targetAmount: 600_000_100,
      custodyBalance: 0,
      totalDisbursed: 0,
      investorRoiPct: 0,
      platformFeePct: 3,
      currentStatus: PROJECT_STATUS.DRAFT,
      startDate: "2026-11-01",
      estimatedEndDate: "2027-03-30",
      currency: "COP",
      assetScale: 2,
      createdAt: now,
    });
  });

  it("creates payable milestones: proveedor = supplies, productor = labor, plataforma = 3 % of both, in sequence", () => {
    const [first, second] = built().milestones;
    expect(first).toMatchObject({ id: "p1-ms-1", projectId: "p1", sequenceOrder: 1, amount: 515_000_000, currency: "COP", assetScale: 2 });
    expect(first.lines.map((l) => [l.kind, l.amount, l.walletAddress])).toEqual([
      [LINE_KIND.PROVEEDOR, 320_000_000, wallets.supplier],
      [LINE_KIND.PRODUCTOR, 180_000_000, wallets.producer],
      [LINE_KIND.PLATAFORMA, 15_000_000, wallets.platform],
    ]);
    // No supplies: no proveedor line (line amounts must be positive).
    expect(second.lines.map((l) => [l.kind, l.amount])).toEqual([
      [LINE_KIND.PRODUCTOR, 100_000_100],
      [LINE_KIND.PLATAFORMA, 3_000_003],
    ]);
    expect(second).toMatchObject({ id: "p1-ms-2", sequenceOrder: 2, amount: 103_000_103, description: "Siembra", estimatedCompletionDate: "2027-01-15" });
  });
});

describe("canView", () => {
  const project = { ownerUserId: "u1" };
  it("lets a seller see only their own projects, and admin, fidu and investor see any", () => {
    expect(canView(project, { id: "u1", role: "seller" })).toBe(true);
    expect(canView(project, { id: "u2", role: "seller" })).toBe(false);
    for (const role of ["admin", "fidu", "investor"] as const) expect(canView(project, { id: "x", role })).toBe(true);
    expect(canView(project, { id: "x", role: "buyer" })).toBe(false);
  });
});
