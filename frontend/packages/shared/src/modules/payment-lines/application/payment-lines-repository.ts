import type { PaymentLine } from "../domain/line";
import type { LineInput } from "../schemas/line";
import type { SupplierInput } from "../schemas/supplier";
import type { Supplier, WalletValidation } from "../domain/supplier";

// The milestone as the lines module sees it: only what the split needs.
export interface MilestoneRef {
  id: string;
  projectId: string;
  sequenceOrder: number;
  title: string;
  // Maximum budget of the milestone = the grant cap, in minimal units.
  cap: number;
  currency: string;
  scale: number;
  // Project terms that shape the split. Absent/null on projects that do not define them.
  contingencyBps?: number | null;
  platformFeeBps?: number | null;
  // The producer's validated billetera (RF-01), when the project registered one.
  producerWallet?: string | null;
  // Estimated completion date and status of the milestone (D-08 "Plazo vencido").
  dueDate?: string | null;
  status?: string | null;
}

export interface MilestoneLines {
  milestone: MilestoneRef;
  lines: PaymentLine[];
}

export interface ProjectLines {
  project: { id: string; title: string; projectCode: string };
  milestones: MilestoneLines[];
}

// One payment line addressed to a supplier, with the milestone and project it belongs to (the supplier's "Mis cobros").
export interface SupplierPayment {
  line: PaymentLine;
  milestone: { id: string; title: string; sequenceOrder: number; currency: string; scale: number };
  project: { id: string; title: string; projectCode: string };
}

export interface PaymentLinesRepository {
  // The lines whose beneficiary is this supplier, across projects.
  listSupplierPayments(supplierId: string): Promise<SupplierPayment[]>;
  listSuppliers(): Promise<Supplier[]>;
  // GET <wallet>: throws ValidationFailure (field `walletAddress`) for an invalid URL or an unknown host.
  validateWallet(walletAddress: string): Promise<WalletValidation>;
  createSupplier(input: SupplierInput): Promise<Supplier>;

  getMilestoneLines(milestoneId: string): Promise<MilestoneLines | null>;
  getProjectLines(projectId: string): Promise<ProjectLines | null>;
  addLine(milestoneId: string, input: LineInput): Promise<PaymentLine>;
  updateLine(lineId: string, input: LineInput): Promise<PaymentLine>;
  removeLine(lineId: string): Promise<void>;
  // Called by the payment flows once the outgoing payment of the line is confirmed.
  markPaid(lineId: string): Promise<PaymentLine>;
  // RF-11: asks the platform to pay a queued or failed line again. Idempotent by `milestone:line`: it never creates a second payment.
  retryPayment(milestoneId: string, lineId: string): Promise<PaymentLine>;
}
