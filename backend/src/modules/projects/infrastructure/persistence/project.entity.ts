import { Column, Entity, PrimaryColumn } from "typeorm";
import { minorUnits } from "../../../milestones/infrastructure/persistence/minor-units.transformer";

// Rows, not domain objects: TypeOrmProjectAdapter maps them. Schema lives in the migrations (no synchronize).
@Entity({ name: "projects" })
export class ProjectEntity {
  @PrimaryColumn("text")
  id: string;
  /** Insertion order, so lists keep the creation order. */
  @Column({ type: "bigint", insert: false, update: false })
  seq: string;
  @Column({ type: "text", name: "owner_user_id" })
  ownerUserId: string;
  @Column({ type: "text", name: "project_code" })
  projectCode: string;
  @Column("text")
  title: string;
  @Column({ type: "text", name: "production_type" })
  productionType: string;
  @Column("text")
  description: string;
  @Column({ type: "bigint", name: "target_amount", transformer: minorUnits })
  targetAmount: number;
  @Column({ type: "bigint", name: "custody_balance", transformer: minorUnits })
  custodyBalance: number;
  @Column({ type: "bigint", name: "total_disbursed", transformer: minorUnits })
  totalDisbursed: number;
  @Column({ type: "double precision", name: "investor_roi_pct" })
  investorRoiPct: number;
  @Column({ type: "double precision", name: "platform_fee_pct" })
  platformFeePct: number;
  @Column({ type: "text", name: "current_status" })
  currentStatus: string;
  /** pg `date`, read back as "yyyy-mm-dd". */
  @Column({ type: "date", name: "start_date" })
  startDate: string;
  @Column({ type: "date", name: "estimated_end_date" })
  estimatedEndDate: string;
  @Column("text")
  currency: string;
  @Column({ type: "integer", name: "asset_scale" })
  assetScale: number;
  @Column({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
}
