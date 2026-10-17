import type { DataSource } from "typeorm";
import type { LineReceipt } from "../../../milestones/application/milestone";
import type { BeneficiaryKind, LiquidationPlan } from "../../application/liquidation";
import type { Payout, PayoutStatus, Settlement, SettlementStatus, SettlementTerms } from "../../application/settlement";
import { SettlementRepository } from "../../ports/settlement.repository";

type SettlementRow = {
  id: string;
  project_id: string;
  status: string;
  currency: string;
  asset_scale: number;
  preferred_rate_bps: number;
  terms: SettlementTerms;
  plan: LiquidationPlan;
  created_by: string;
  created_at: Date;
  approved_by: string | null;
  approved_at: Date | null;
  executed_at: Date | null;
};

type PayoutRow = {
  settlement_id: string;
  id: string;
  beneficiary_kind: string;
  beneficiary_id: string;
  wallet_address: string;
  wallet_currency: string;
  amount: string;
  fixed_debit_amount: boolean;
  status: string;
  reference: string | null;
  settled_at: Date | null;
  receipt: LineReceipt | null;
};

// pg returns bigint as a string; anything past a safe integer is a corrupt row, not a rounding.
function safeInteger(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`Stored amount ${value} is not a safe integer`);
  return n;
}

const toPayout = (r: PayoutRow): Payout => ({
  id: r.id,
  beneficiary: { kind: r.beneficiary_kind as BeneficiaryKind, id: r.beneficiary_id },
  walletAddress: r.wallet_address,
  walletCurrency: r.wallet_currency,
  amount: safeInteger(r.amount),
  fixedDebitAmount: r.fixed_debit_amount,
  status: r.status as PayoutStatus,
  reference: r.reference,
  settledAt: r.settled_at,
  receipt: r.receipt,
});

const toSettlement = (r: SettlementRow, payouts: PayoutRow[]): Settlement => ({
  id: r.id,
  projectId: r.project_id,
  status: r.status as SettlementStatus,
  currency: r.currency,
  assetScale: r.asset_scale,
  preferredRateBps: r.preferred_rate_bps,
  terms: r.terms,
  plan: r.plan,
  payouts: payouts.map(toPayout),
  createdBy: r.created_by,
  createdAt: r.created_at,
  approvedBy: r.approved_by,
  approvedAt: r.approved_at,
  executedAt: r.executed_at,
});

// Plain SQL, no entities: the settlement and its payouts are written together and read back in payout order.
export class TypeOrmSettlementAdapter extends SettlementRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  save(s: Settlement) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO settlements (id, project_id, status, currency, asset_scale, preferred_rate_bps, terms, plan, created_by, created_at, approved_by, approved_at, executed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, approved_by = EXCLUDED.approved_by, approved_at = EXCLUDED.approved_at, executed_at = EXCLUDED.executed_at`,
        [s.id, s.projectId, s.status, s.currency, s.assetScale, s.preferredRateBps, JSON.stringify(s.terms), JSON.stringify(s.plan), s.createdBy, s.createdAt, s.approvedBy, s.approvedAt, s.executedAt],
      );
      for (const [position, p] of s.payouts.entries()) {
        await manager.query(
          `INSERT INTO settlement_payouts (settlement_id, id, position, beneficiary_kind, beneficiary_id, wallet_address, wallet_currency, amount, fixed_debit_amount, status, reference, settled_at, receipt)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (settlement_id, id) DO UPDATE SET status = EXCLUDED.status, reference = EXCLUDED.reference, settled_at = EXCLUDED.settled_at, receipt = EXCLUDED.receipt`,
          [
            s.id,
            p.id,
            position,
            p.beneficiary.kind,
            p.beneficiary.id,
            p.walletAddress,
            p.walletCurrency,
            p.amount,
            p.fixedDebitAmount,
            p.status,
            p.reference,
            p.settledAt,
            p.receipt === null ? null : JSON.stringify(p.receipt),
          ],
        );
      }
    });
  }

  private async withPayouts(rows: SettlementRow[]): Promise<Settlement[]> {
    if (rows.length === 0) return [];
    const payouts: PayoutRow[] = await this.dataSource.query("SELECT * FROM settlement_payouts WHERE settlement_id = ANY($1) ORDER BY position", [rows.map((r) => r.id)]);
    return rows.map((r) => toSettlement(r, payouts.filter((p) => p.settlement_id === r.id)));
  }

  async findById(id: string) {
    const rows: SettlementRow[] = await this.dataSource.query("SELECT * FROM settlements WHERE id = $1", [id]);
    const [settlement] = await this.withPayouts(rows);
    return settlement ?? null;
  }

  async findByProject(projectId: string) {
    return this.withPayouts(await this.dataSource.query("SELECT * FROM settlements WHERE project_id = $1 ORDER BY created_at, id", [projectId]));
  }
}
