// Producer projects (PRD `projects`) and how creating one builds its payable milestones. Pure functions: no Nest, no I/O.
// Amounts are integer minor units like the milestones; whole pesos exist only at the /api boundary (pesosToMinor/minorToPesos).

import { addFieldError, DomainError, type FieldErrors, ValidationError } from "../../../shared/domain-errors";
import type { Role } from "../../auth/ports/role";
import { createMilestone, LINE_KIND, type LineInput, type Milestone, type Requirement } from "../../milestones/application/milestone";
import type { CustodyGate } from "../../milestones/application/milestone-progress";

export const PROJECT_STATUS = {
  DRAFT: "DRAFT",
  CONTRACT_SIGNED: "CONTRACT_SIGNED",
  FUNDING_IN_PROGRESS: "FUNDING_IN_PROGRESS",
  FUNDED_IN_CUSTODY: "FUNDED_IN_CUSTODY",
  IN_EXECUTION: "IN_EXECUTION",
  HARVEST_DECLARED: "HARVEST_DECLARED",
  HARVEST_CERTIFIED: "HARVEST_CERTIFIED",
  LISTED_IN_MARKET: "LISTED_IN_MARKET",
  MARKET_PAYMENT_HELD: "MARKET_PAYMENT_HELD",
  DELIVERED_TO_BUYER: "DELIVERED_TO_BUYER",
  SETTLEMENT_PROCESSING: "SETTLEMENT_PROCESSING",
  SETTLED_AND_CLOSED: "SETTLED_AND_CLOSED",
  CANCELLED_OR_DISPUTED: "CANCELLED_OR_DISPUTED",
} as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PRODUCTION_TYPE = { CAFE_ESPECIAL: "CAFE_ESPECIAL", CACAO: "CACAO", AGUACATE_HASS: "AGUACATE_HASS", OTRO: "OTRO" } as const;
export type ProductionType = (typeof PRODUCTION_TYPE)[keyof typeof PRODUCTION_TYPE];

/** PRD v3 D-06. The web app's mock used 2. */
export const PLATFORM_FEE_PCT = 3;
export const PROJECT_CURRENCY = "COP";
export const PROJECT_ASSET_SCALE = 2;

export type Project = {
  id: string;
  /** Better Auth user id of the producer (role seller) who created it. */
  ownerUserId: string;
  projectCode: string;
  title: string;
  productionType: string;
  description: string;
  /** Σ(supplies + labor) of its milestones, minor units; the platform fee is on top. */
  targetAmount: number;
  /**
   * RF-21 custody rule (the one place it is written down), minor units. custodyBalance is the custody ledger's net: every CREDIT
   * (BUYER_DEPOSIT, INVESTOR_CAPITAL, HARVEST_PAYMENT, INDEMNITY) adds to it and every ledger DEBIT (PREMIUM) subtracts from it,
   * in the same transaction as its ledger row. Milestone lines and liquidation payouts are not ledger rows: they are derived from
   * the milestones and settlements and subtracted on read. So what is still in custody is
   *   custodyBalance − milestone lines paid or in flight − liquidation payouts paid or in flight,
   * and the premium, already out of custodyBalance, is never subtracted again. The custody statement (harvest/domain/panel.ts,
   * where credited = custodyBalance + ledger debits) and the settlement's default L (custodyBalance − milestone lines, before any
   * payout exists) both apply this rule.
   */
  custodyBalance: number;
  totalDisbursed: number;
  investorRoiPct: number;
  platformFeePct: number;
  currentStatus: ProjectStatus;
  /** ISO yyyy-mm-dd. */
  startDate: string;
  estimatedEndDate: string;
  currency: string;
  assetScale: number;
  createdAt: Date;
};

/** The code is allocated by the repository, inside the transaction that stores the project. */
export type NewProject = Omit<Project, "projectCode">;

/** Budgets in whole pesos, ordered by sequence. */
export type NewMilestoneInput = {
  title: string;
  description: string;
  estimatedCompletionDate: string;
  suppliesBudget: number;
  laborBudget: number;
  requirements: Requirement[];
};

export type NewProjectInput = {
  title: string;
  description: string;
  productionType: string;
  startDate: string;
  estimatedEndDate: string;
  milestones: NewMilestoneInput[];
};

export type ProjectWallets = { producer: string; supplier: string; platform: string };

export type Viewer = { id: string; role: Role };

export const formatProjectCode = (year: number, n: number) => `AGR-${year}-${String(n).padStart(3, "0")}`;

export function pesosToMinor(pesos: number, assetScale: number): number {
  const minor = pesos * 10 ** assetScale;
  if (!Number.isSafeInteger(pesos) || pesos < 0 || !Number.isSafeInteger(minor)) throw new DomainError(`${pesos} is not a whole, non-negative peso amount`);
  return minor;
}

export const minorToPesos = (minor: number, assetScale: number) => minor / 10 ** assetScale;

/** pct % of base, rounded half down, in BigInt so large bases never round through floats. */
export function platformFee(base: number, pct: number): number {
  if (!Number.isSafeInteger(base) || !Number.isInteger(pct) || pct < 0) throw new DomainError("Fee needs a safe integer base and an integer percentage");
  const scaled = BigInt(base) * BigInt(pct);
  const rest = scaled % 100n;
  return Number(scaled / 100n + (rest > 50n ? 1n : 0n));
}

// The same rules and messages as the web app's createProjectInputSchema, so a server rejection lands on the same field.
const PRODUCTION_TYPES: readonly string[] = Object.values(PRODUCTION_TYPE);

const isIsoDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
};

function text(errors: FieldErrors, path: string, value: unknown, min: number, max: number, messages: { missing: string; short: string }) {
  if (typeof value !== "string") {
    addFieldError(errors, path, messages.missing);
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length < min) addFieldError(errors, path, messages.short);
  else if (trimmed.length > max) addFieldError(errors, path, `Máximo ${max} caracteres.`);
  return trimmed;
}

function budgetError(value: unknown, label: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return `${label}: ingresa un valor numérico.`;
  if (!Number.isInteger(value)) return `${label}: ingresa un valor entero en pesos.`;
  if (value < 0) return `${label}: no puede ser negativo.`;
  if (!Number.isSafeInteger(value * 10 ** PROJECT_ASSET_SCALE)) return `${label}: el valor es demasiado grande.`;
  return null;
}

function budget(errors: FieldErrors, path: string, value: unknown, label: string) {
  const error = budgetError(value, label);
  if (error) addFieldError(errors, path, error);
  return error === null;
}

function date(errors: FieldErrors, path: string, value: unknown, message: string) {
  if (!isIsoDate(value)) addFieldError(errors, path, message);
}

export function validateNewProject(input: NewProjectInput): NewProjectInput {
  const errors: FieldErrors = {};
  const title = text(errors, "title", input.title, 3, 120, { missing: "Ingresa el nombre del proyecto.", short: "El nombre debe tener al menos 3 caracteres." });
  const description = text(errors, "description", input.description, 10, 2000, {
    missing: "Ingresa la descripción del proyecto.",
    short: "La descripción debe tener al menos 10 caracteres.",
  });
  if (!PRODUCTION_TYPES.includes(input.productionType)) addFieldError(errors, "productionType", "Selecciona un tipo de producción.");
  date(errors, "startDate", input.startDate, "Ingresa una fecha de inicio válida.");
  date(errors, "estimatedEndDate", input.estimatedEndDate, "Ingresa una fecha de finalización válida.");
  if (!Array.isArray(input.milestones) || input.milestones.length === 0) addFieldError(errors, "milestones", "Agrega al menos un hito.");

  const milestones = (Array.isArray(input.milestones) ? input.milestones : []).map((m, i) => {
    const at = (field: string) => `milestones.${i}.${field}`;
    const title = text(errors, at("title"), m.title, 3, 120, { missing: "Ingresa el nombre del hito.", short: "El nombre debe tener al menos 3 caracteres." });
    const description = text(errors, at("description"), m.description, 1, 1000, { missing: "Ingresa la descripción del hito.", short: "Ingresa la descripción del hito." });
    date(errors, at("estimatedCompletionDate"), m.estimatedCompletionDate, "Ingresa una fecha estimada válida.");
    budget(errors, at("suppliesBudget"), m.suppliesBudget, "Insumos");
    budget(errors, at("laborBudget"), m.laborBudget, "Mano de obra");
    return { title, description, source: m };
  });

  // Cross-field rules run only on well-formed values, like the client's superRefine.
  if (Object.keys(errors).length === 0) {
    if (input.estimatedEndDate < input.startDate) {
      addFieldError(errors, "estimatedEndDate", "La fecha de finalización debe ser igual o posterior al inicio.");
    } else {
      milestones.forEach(({ source: m }, i) => {
        if (m.estimatedCompletionDate < input.startDate || m.estimatedCompletionDate > input.estimatedEndDate) {
          addFieldError(errors, `milestones.${i}.estimatedCompletionDate`, "La fecha debe estar dentro del periodo del proyecto.");
        }
        // Labor 0 is a milestone without jornales (levels C and primer ciclo, PRD v3), like the client allows.
        if (m.suppliesBudget + m.laborBudget <= 0) addFieldError(errors, `milestones.${i}.laborBudget`, "La cotización del hito debe ser mayor a cero.");
      });
    }
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, "Invalid project payload");

  return {
    title,
    description,
    productionType: input.productionType,
    startDate: input.startDate,
    estimatedEndDate: input.estimatedEndDate,
    milestones: milestones.map(({ title: t, description: d, source }) => ({ ...source, title: t, description: d })),
  };
}

type BuildProject = { id: string; ownerUserId: string; input: NewProjectInput; wallets: ProjectWallets; now: Date };

// Each milestone's amount (its grant cap, RF-13) is supplies + labor + the 3 % fee. Productor = labor and plataforma = fee exist from
// the start and are paid on approval; supplies stay unallocated cap that approved orders turn into proveedor lines (RF-15/RF-16).
export function buildProject({ id, ownerUserId, input, wallets, now }: BuildProject): { project: NewProject; milestones: Milestone[] } {
  const valid = validateNewProject(input);
  const scale = PROJECT_ASSET_SCALE;
  const milestones = valid.milestones.map((m, i) => {
    const milestoneId = `${id}-ms-${i + 1}`;
    const supplies = pesosToMinor(m.suppliesBudget, scale);
    const labor = pesosToMinor(m.laborBudget, scale);
    const fee = platformFee(supplies + labor, PLATFORM_FEE_PCT);
    const lines: LineInput[] = [
      { id: `${milestoneId}-productor`, kind: LINE_KIND.PRODUCTOR, beneficiary: "Productor", walletAddress: wallets.producer, amount: labor },
      { id: `${milestoneId}-plataforma`, kind: LINE_KIND.PLATAFORMA, beneficiary: "Plataforma Surco", walletAddress: wallets.platform, amount: fee },
    ].filter((l) => l.amount > 0);
    return createMilestone({
      id: milestoneId,
      title: m.title,
      amount: supplies + labor + fee,
      currency: PROJECT_CURRENCY,
      assetScale: scale,
      lines,
      projectId: id,
      sequenceOrder: i + 1,
      description: m.description,
      estimatedCompletionDate: m.estimatedCompletionDate,
      requirements: m.requirements,
    });
  });
  const targetAmount = valid.milestones.reduce((sum, m) => sum + pesosToMinor(m.suppliesBudget, scale) + pesosToMinor(m.laborBudget, scale), 0);
  const project: NewProject = {
    id,
    ownerUserId,
    title: valid.title,
    description: valid.description,
    productionType: valid.productionType,
    targetAmount,
    // ponytail: balances stay 0 until funding and payouts roll up to the project (custody per project, RF-05).
    custodyBalance: 0,
    totalDisbursed: 0,
    investorRoiPct: 0,
    platformFeePct: PLATFORM_FEE_PCT,
    currentStatus: PROJECT_STATUS.DRAFT,
    startDate: valid.startDate,
    estimatedEndDate: valid.estimatedEndDate,
    currency: PROJECT_CURRENCY,
    assetScale: scale,
    createdAt: now,
  };
  return { project, milestones };
}

// Before the buyer's deposit lands in custody the project's milestones stay LOCKED (PRD v3: FUNDED_IN_CUSTODY opens the first).
const PRE_CUSTODY: readonly ProjectStatus[] = [PROJECT_STATUS.DRAFT, PROJECT_STATUS.CONTRACT_SIGNED, PROJECT_STATUS.FUNDING_IN_PROGRESS];
export const custodyGate = (project: Pick<Project, "currentStatus">): CustodyGate => ({ custodyFunded: !PRE_CUSTODY.includes(project.currentStatus) });

const READ_ANY: readonly Role[] = ["admin", "fidu", "investor"];

/** A seller (producer) sees only their own projects; admin, fidu and investor see every project. */
export const canView = (project: Pick<Project, "ownerUserId">, viewer: Viewer) =>
  READ_ANY.includes(viewer.role) || (viewer.role === "seller" && project.ownerUserId === viewer.id);
