import { PRODUCER_BENEFICIARY } from "../../domain/line";
import type { LineDto, SupplierDto } from "../dto";

export const SEED_PROJECT_ID = "proj-finca-la-esperanza";

const wallet = (slug: string) => `https://ilp.interledger-test.dev/${slug}`;

const supplier = (id: string, name: string, category: string, slug: string, publicName: string): SupplierDto => ({
  id,
  name,
  category,
  wallet_address: wallet(slug),
  asset_code: "COP",
  asset_scale: 0,
  public_name: publicName,
  status: "VALIDATED",
  created_at: "2026-07-10T15:00:00Z",
});

// Four validated suppliers.
export const createSupplierFixtures = (): SupplierDto[] => [
  supplier("sup-agroinsumos-huila", "Agroinsumos del Huila", "insumos", "agroinsumos-huila", "Agroinsumos Huila"),
  supplier("sup-transportes-andes", "Transportes Andes", "transporte", "transportes-andes", "Transportes Andes"),
  supplier("sup-vivero-andino", "Vivero Andino", "insumos", "vivero-andino", "Vivero Andino"),
  supplier("sup-agrotecnica", "Agrotécnica del Café", "servicios_tecnicos", "agrotecnica-cafe", "Agrotécnica del Café"),
];

const SUPPLIER_WALLET = (id: string) => createSupplierFixtures().find((s) => s.id === id)!;

const line = (
  id: string,
  milestoneId: string,
  who: { role: "SUPPLIER" | "PRODUCER"; id: string; name: string; wallet_address: string },
  rest: Pick<LineDto, "concept" | "reference" | "amount_mode" | "value" | "moment" | "status"> & { receipt_id?: string },
): LineDto => ({ id, milestone_id: milestoneId, beneficiary: who, receipt_id: null, created_at: "2026-08-01T12:00:00Z", ...rest });

const asBeneficiary = (supplierId: string) => {
  const s = SUPPLIER_WALLET(supplierId);
  return { role: "SUPPLIER" as const, id: s.id, name: s.name, wallet_address: s.wallet_address };
};

const producer = { role: "PRODUCER" as const, id: PRODUCER_BENEFICIARY.id, name: PRODUCER_BENEFICIARY.name, wallet_address: PRODUCER_BENEFICIARY.walletAddress };

// Milestone ids and caps come from the shared milestone fixtures:
//   ms-01 cap 5,000,000 (supplies 3,200,000 + labor 1,800,000), ms-02 cap 6,900,000 (supplies 4,500,000 + labor 2,400,000).
export const createLineFixtures = (): LineDto[] => [
  // ms-01: two open invoices of the same supplier in the same moment (they consolidate into one payment, one commission).
  line("ln-101", "ms-01", asBeneficiary("sup-agroinsumos-huila"), { concept: "factura", reference: "F-0231", amount_mode: "FIXED", value: 2100000, moment: "insumos", status: "COMPLETED", receipt_id: "rcp-ln-101" }),
  line("ln-102", "ms-01", asBeneficiary("sup-agroinsumos-huila"), { concept: "factura", reference: "F-0240", amount_mode: "FIXED", value: 450000, moment: "insumos", status: "PENDING" }),
  line("ln-103", "ms-01", asBeneficiary("sup-agroinsumos-huila"), { concept: "factura", reference: "F-0244", amount_mode: "FIXED", value: 300000, moment: "insumos", status: "PENDING" }),
  line("ln-104", "ms-01", asBeneficiary("sup-transportes-andes"), { concept: "orden", reference: "T-014", amount_mode: "FIXED", value: 350000, moment: "insumos", status: "PENDING" }),
  // 30% of the cap, paid when the verifier approves.
  line("ln-105", "ms-01", producer, { concept: "mano_de_obra", reference: "", amount_mode: "PERCENT", value: 3000, moment: "aprobacion", status: "PENDING" }),

  // ms-02: one line of each non-final state besides completed.
  line("ln-201", "ms-02", asBeneficiary("sup-vivero-andino"), { concept: "factura", reference: "F-310", amount_mode: "FIXED", value: 3200000, moment: "insumos", status: "PENDING" }),
  line("ln-202", "ms-02", asBeneficiary("sup-transportes-andes"), { concept: "orden", reference: "T-021", amount_mode: "FIXED", value: 180000, moment: "insumos", status: "FAILED" }),
  line("ln-203", "ms-02", asBeneficiary("sup-agrotecnica"), { concept: "factura", reference: "F-077", amount_mode: "FIXED", value: 250000, moment: "insumos", status: "QUEUED" }),
  line("ln-204", "ms-02", producer, { concept: "mano_de_obra", reference: "", amount_mode: "FIXED", value: 2400000, moment: "aprobacion", status: "PENDING" }),
];
