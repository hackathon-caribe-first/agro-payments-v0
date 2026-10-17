import type { DataSource } from "typeorm";
import type { SecretCipher } from "../../../../shared/crypto/secret-cipher";
import { type Grant, GRANT_PURPOSE, type GrantPurpose, type GrantStatus, GrantStore } from "../../ports/grant-store";
import { GrantEntity } from "./grant.entity";

// RF-06: tokens and nonces are sealed with AES-256-GCM before they reach Postgres; URLs stay plain for diagnosis.
export class TypeOrmGrantStore extends GrantStore {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cipher: SecretCipher,
  ) {
    super();
  }

  async save(grant: Grant) {
    await this.dataSource.getRepository(GrantEntity).upsert(this.toRow(grant), ["id"]);
  }

  async findLatestForMilestone(milestoneId: string) {
    const row = await this.dataSource
      .getRepository(GrantEntity)
      .findOne({ where: { milestoneId, purpose: GRANT_PURPOSE.MILESTONE }, order: { createdAt: "DESC" } });
    return row ? this.toGrant(row) : null;
  }

  async findLatestForNegotiation(negotiationId: string) {
    const row = await this.dataSource
      .getRepository(GrantEntity)
      .findOne({ where: { negotiationId, purpose: GRANT_PURPOSE.BUYER_DEPOSIT }, order: { createdAt: "DESC" } });
    return row ? this.toGrant(row) : null;
  }

  async findLatestForInvestment(investmentId: string) {
    const row = await this.dataSource
      .getRepository(GrantEntity)
      .findOne({ where: { investmentId, purpose: GRANT_PURPOSE.INVESTOR_CAPTURE }, order: { createdAt: "DESC" } });
    return row ? this.toGrant(row) : null;
  }

  private seal = (value: string | undefined) => (value === undefined ? null : this.cipher.encrypt(value));
  private open = (value: string | null) => (value === null ? null : this.cipher.decrypt(value));

  private toRow(g: Grant): GrantEntity {
    return {
      id: g.id,
      purpose: g.purpose,
      projectId: g.projectId,
      milestoneId: g.milestoneId,
      negotiationId: g.negotiationId ?? null,
      investmentId: g.investmentId ?? null,
      payerWalletAddress: g.payerWalletAddress,
      assetCode: g.assetCode,
      assetScale: g.assetScale,
      debitLimit: g.debitLimit,
      status: g.status,
      pendingClientNonceEnc: this.seal(g.pending?.clientNonce),
      pendingFinishNonceEnc: this.seal(g.pending?.finishNonce),
      pendingContinueUri: g.pending?.continueUri ?? null,
      pendingContinueTokenEnc: this.seal(g.pending?.continueToken),
      pendingAuthServer: g.pending?.authServer ?? null,
      accessTokenEnc: this.seal(g.access?.accessToken),
      manageUrl: g.access?.manageUrl ?? null,
      continueUri: g.access?.continueUri ?? null,
      continueTokenEnc: this.seal(g.access?.continueToken),
      createdAt: g.createdAt,
      revokedAt: g.revokedAt,
    };
  }

  private toGrant(r: GrantEntity): Grant {
    const clientNonce = this.open(r.pendingClientNonceEnc);
    const finishNonce = this.open(r.pendingFinishNonceEnc);
    const pendingToken = this.open(r.pendingContinueTokenEnc);
    const accessToken = this.open(r.accessTokenEnc);
    const continueToken = this.open(r.continueTokenEnc);
    return {
      id: r.id,
      purpose: r.purpose as GrantPurpose,
      projectId: r.projectId,
      milestoneId: r.milestoneId,
      ...(r.negotiationId !== null && { negotiationId: r.negotiationId }),
      ...(r.investmentId !== null && { investmentId: r.investmentId }),
      payerWalletAddress: r.payerWalletAddress,
      assetCode: r.assetCode,
      assetScale: r.assetScale,
      debitLimit: r.debitLimit,
      status: r.status as GrantStatus,
      pending:
        clientNonce !== null && finishNonce !== null && pendingToken !== null && r.pendingContinueUri && r.pendingAuthServer
          ? { clientNonce, finishNonce, continueUri: r.pendingContinueUri, continueToken: pendingToken, authServer: r.pendingAuthServer }
          : null,
      access:
        accessToken !== null && continueToken !== null && r.manageUrl && r.continueUri
          ? { accessToken, manageUrl: r.manageUrl, continueUri: r.continueUri, continueToken }
          : null,
      createdAt: r.createdAt,
      revokedAt: r.revokedAt,
    };
  }
}
