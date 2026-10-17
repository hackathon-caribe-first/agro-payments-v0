// The PRD v3 demo projects (tabla «Proyecto de demo» and «Símbolos y valores de referencia» of Anexo A) as motor inputs.
// Demo mode (D-15): r_f = 0, no fiduciary fee, τ = 0, no logistics, no Finagro. Where the PRD gives no number the choice
// is marked «assumed»; every one of them is listed in the report.
import { DEFAULT_RUNS, DEFAULT_SEED, PRICE_KIND, type SimulationInputs } from "./motor";

export const PRESET_ID = { P1: "P1", P2: "P2" } as const;
export type PresetId = (typeof PRESET_ID)[keyof typeof PRESET_ID];

export interface Preset {
  id: PresetId;
  name: string;
  description: string;
  inputs: SimulationInputs;
}

const ALL_FILTERS_PASS = Array<boolean>(9).fill(true);
/** «Lo que muestra la ficha al inversionista en dólares»: entry 3.218,75, exits 3.000 / 3.359 / 3.600. */
const USD = { currency: "USD", entryRate: 3218.75, exitRates: [3000, 3359, 3600] };
/** assumed: EUR/COP 3.750 at entry, exits moved by the same −6,8 % / +4,4 % / +11,8 % as the PRD's USD scenarios. */
const EUR = { currency: "EUR", entryRate: 3750, exitRates: [3495, 3913, 4194] };

const common = {
  producerContributionInCash: true,
  contingencyPct: 5, // κ, D-05
  platformFeePct: 3, // f_h, D-06
  offContractPct: 0, // s
  insurance: { premiumPct: 6, subsidyPct: 85, triggerPct: 70, deductiblePct: 10 }, // Finagro ISA 2026; convención
  parafiscalPct: 0,
  withholdingPct: 0,
  logisticsPerTonne: 0,
  fiduciaryYieldPct: 0,
  fiduciaryMonthlyFee: 0,
  integratorSharePct: 0,
  integratorRatePct: 4, // LEC 4 %, unused while ω = 0
  icr: 0,
  preferredRatePct: 12, // h
  offeredReturnPct: 12, // assumed: r_ofrecido = h; with it P1's A12 minimum price lands near the PRD's 1,126 M/t
  inflationPct: 6.29, // π, IPC sep-2026
  catastropheMinPct: 50,
  catastropheMaxPct: 80,
  runs: DEFAULT_RUNS,
  seed: DEFAULT_SEED,
} as const;

export const PRESETS: Record<PresetId, Preset> = {
  P1: {
    id: PRESET_ID.P1,
    name: "P1 · Maíz, Tolima",
    description: "20 ha, 150 días, contrato a paridad de COP 1,05 M/t. No publicable: el comprador debe pactar un precio mayor.",
    inputs: {
      ...common,
      insurance: { ...common.insurance },
      crop: "Maíz, Tolima",
      hectares: 20,
      days: 150,
      costPerHectare: 7_500_000,
      producerContributionPct: 0,
      // δ 60/25/15 % on days 0/45/110; labor 14,4 % (the «Split del hito» example: 5,4 M of 37,5 M).
      milestones: [
        { title: "Preparación y siembra", day: 0, sharePct: 60, laborPct: 14.4 },
        { title: "Fertilización y control", day: 45, sharePct: 25, laborPct: 14.4 },
        { title: "Cosecha y poscosecha", day: 110, sharePct: 15, laborPct: 14.4 },
      ],
      expectedYieldKgPerHa: 8_000,
      shrinkagePct: 3,
      price: { kind: PRICE_KIND.FIXED, perKg: 1_050 },
      catastropheProbabilityPct: 15,
      yieldNoisePct: 15,
      currencies: [USD],
      // assumed block scores → 64,25 = level B (the PRD's split example calls P1 level B).
      admission: { filters: [...ALL_FILTERS_PASS], blocks: [70, 60, 70, 65, 60, 55, 60] },
    },
  },
  P2: {
    id: PRESET_ID.P2,
    name: "P2 · Tomate bajo invernadero",
    description: "1 ha, 120 días, contrato a COP 1.300/kg, aporte propio del 10 %. Publicable en nivel B con ficha en COP, USD y EUR.",
    inputs: {
      ...common,
      insurance: { ...common.insurance },
      crop: "Tomate bajo invernadero",
      hectares: 1,
      days: 120,
      costPerHectare: 80_000_000,
      producerContributionPct: 10,
      // δ 50/30/20 % on days 0/30/75; labor 12 % (assumed, bottom of the PRD's 12–15 %).
      milestones: [
        { title: "Montaje y trasplante", day: 0, sharePct: 50, laborPct: 12 },
        { title: "Nutrición y tutorado", day: 30, sharePct: 30, laborPct: 12 },
        { title: "Cosecha escalonada", day: 75, sharePct: 20, laborPct: 12 },
      ],
      expectedYieldKgPerHa: 85_000,
      shrinkagePct: 8,
      price: { kind: PRICE_KIND.FIXED, perKg: 1_300 },
      catastropheProbabilityPct: 8,
      yieldNoisePct: 12,
      currencies: [USD, EUR],
      // assumed block scores → 68 = level B («Sí, nivel B»).
      admission: { filters: [...ALL_FILTERS_PASS], blocks: [75, 70, 70, 60, 70, 65, 50] },
    },
  },
};

export const isPresetId = (v: unknown): v is PresetId => typeof v === "string" && Object.hasOwn(PRESETS, v);
