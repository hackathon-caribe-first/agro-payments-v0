import type { ContractDocument, ContractSignature } from "../application/contract-document";
import type { InsuranceClaim, InsurancePolicy } from "../application/insurance";
import type { PurchaseContract } from "../application/purchase-contract";

/** One custody ledger movement: amount in minor units (booked in whole pesos), the payment reference when there is one. */
export type CustodyEntry = { id: string; projectId: string; amount: number; currency: string; assetScale: number; reference: string | null; at: Date };

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class ContractsStore {
  abstract findPurchaseContract(projectId: string): Promise<PurchaseContract | null>;
  abstract savePurchaseContract(contract: PurchaseContract): Promise<void>;
  abstract findPolicy(projectId: string): Promise<InsurancePolicy | null>;
  abstract savePolicy(policy: InsurancePolicy): Promise<void>;
  /** The newest version of the project's contract, with its signatures. */
  abstract latestDocument(projectId: string): Promise<ContractDocument | null>;
  abstract findDocument(id: string): Promise<ContractDocument | null>;
  /** Inserts a new version (no signatures yet). */
  abstract insertDocument(document: ContractDocument): Promise<void>;
  /** Appends signatures; a party signs a document once (unique), so a replay is refused. */
  abstract addSignatures(documentId: string, signatures: ContractSignature[]): Promise<void>;
  /** One row per investor with a captured investment: COP capital (minor units) summed. */
  abstract capturedInvestors(projectId: string): Promise<{ userId: string; capital: number }[]>;
  /** Oldest first. */
  abstract listClaims(projectId: string): Promise<InsuranceClaim[]>;
  abstract findClaim(id: string): Promise<InsuranceClaim | null>;
  abstract saveClaim(claim: InsuranceClaim): Promise<void>;
  /**
   * RF-14, under the project row lock: ledger DEBIT PREMIUM, custody_balance −= amount (refused with a RejectedError when custody
   * holds less) and the policy as given, all or nothing. One premium debit per policy payment id.
   */
  abstract bookPremium(policy: InsurancePolicy, entry: CustodyEntry): Promise<void>;
  /** RF-25, under the project row lock: ledger CREDIT INDEMNITY, custody_balance += amount and the claim as given. One credit per claim. */
  abstract bookIndemnity(claim: InsuranceClaim, entry: CustodyEntry): Promise<void>;
}
