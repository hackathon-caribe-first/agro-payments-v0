import { Column, Entity, PrimaryColumn } from "typeorm";
import { minorUnits } from "./minor-units.transformer";

// *Enc columns hold SecretCipher-sealed values; only TypeOrmGrantStore seals and opens them.
@Entity({ name: "grants" })
export class GrantEntity {
  @PrimaryColumn("uuid")
  id: string;
  @Column("text")
  purpose: string;
  @Column({ type: "text", name: "project_id", nullable: true })
  projectId: string | null;
  @Column({ type: "text", name: "milestone_id", nullable: true })
  milestoneId: string | null;
  @Column({ type: "text", name: "payer_wallet_address" })
  payerWalletAddress: string;
  @Column({ type: "text", name: "asset_code" })
  assetCode: string;
  @Column({ type: "integer", name: "asset_scale" })
  assetScale: number;
  @Column({ type: "bigint", name: "debit_limit", transformer: minorUnits })
  debitLimit: number;
  @Column("text")
  status: string;
  @Column({ type: "text", name: "pending_client_nonce_enc", nullable: true })
  pendingClientNonceEnc: string | null;
  @Column({ type: "text", name: "pending_finish_nonce_enc", nullable: true })
  pendingFinishNonceEnc: string | null;
  @Column({ type: "text", name: "pending_continue_uri", nullable: true })
  pendingContinueUri: string | null;
  @Column({ type: "text", name: "pending_continue_token_enc", nullable: true })
  pendingContinueTokenEnc: string | null;
  @Column({ type: "text", name: "pending_auth_server", nullable: true })
  pendingAuthServer: string | null;
  @Column({ type: "text", name: "access_token_enc", nullable: true })
  accessTokenEnc: string | null;
  @Column({ type: "text", name: "manage_url", nullable: true })
  manageUrl: string | null;
  @Column({ type: "text", name: "continue_uri", nullable: true })
  continueUri: string | null;
  @Column({ type: "text", name: "continue_token_enc", nullable: true })
  continueTokenEnc: string | null;
  @Column({ type: "timestamptz", name: "created_at" })
  createdAt: Date;
  @Column({ type: "timestamptz", name: "revoked_at", nullable: true })
  revokedAt: Date | null;
}
