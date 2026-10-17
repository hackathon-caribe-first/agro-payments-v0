import type { Custody, HarvestEnvelope, InvestorPanel } from "../domain/harvest";

/** Wire bodies of the harvest writes (snake_case is the transport's business; these are already validated). */
export type DeclareBody = { quantityKg: number; qualityGrade: string; evidence: string };
export type CertifyBody = { quantityKg: number; qualityGrade: string; notes: string | null; pricePerKg: number };

// Port for RF-24 / RF-21 / RF-27. Implementations throw BoundaryError, NetworkError or ValidationFailure (400/409).
export interface HarvestRepository {
  /** Null when the project does not exist (or the caller cannot see it). */
  get(projectId: string): Promise<HarvestEnvelope | null>;
  listForReview(): Promise<HarvestEnvelope[]>;
  declare(projectId: string, body: DeclareBody): Promise<HarvestEnvelope>;
  certify(projectId: string, body: CertifyBody): Promise<HarvestEnvelope>;
  pay(projectId: string): Promise<HarvestEnvelope>;
  confirmReception(projectId: string): Promise<HarvestEnvelope>;
  custody(projectId: string): Promise<Custody | null>;
  panel(projectId: string): Promise<InvestorPanel | null>;
}
