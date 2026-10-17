import { NetworkError, ValidationFailure } from "../../milestones/domain/errors";
import { readFieldErrors } from "../../projects/infrastructure/http-project-repository";
import type { MilestoneLines, PaymentLinesRepository, ProjectLines, SupplierPayment } from "../application/payment-lines-repository";
import type { LineInput } from "../schemas/line";
import type { SupplierInput } from "../schemas/supplier";
import type { PaymentLine } from "../domain/line";
import type { Supplier, WalletValidation } from "../domain/supplier";
import { toLine, toMilestoneLines, toProjectLines, toSupplier, toSupplierPayments, toSuppliers, toWalletValidation } from "./mapper";

interface Options {
  baseUrl: string;
  fetchFn: typeof fetch;
}

const enc = encodeURIComponent;

const lineBody = (input: LineInput) => ({
  beneficiary_id: input.beneficiaryId,
  concept: input.concept,
  reference: input.reference,
  amount_mode: input.amountMode,
  value: input.value,
  moment: input.moment,
});

export class HttpPaymentLinesRepository implements PaymentLinesRepository {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl, fetchFn }: Options) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new NetworkError(cause instanceof Error ? cause.message : "Network request failed");
    }
  }

  // 400 (invalid input) and 409 (business conflict) share one body shape and both surface as field/form errors.
  private async json(response: Response): Promise<unknown> {
    if (response.status === 400 || response.status === 409) throw new ValidationFailure(await readFieldErrors(response));
    if (!response.ok) throw new NetworkError(`Unexpected response ${response.status}`, response.status);
    return response.json();
  }

  private send(method: string, path: string, body?: unknown) {
    return this.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async listSuppliers(): Promise<Supplier[]> {
    return toSuppliers(await this.json(await this.request("/suppliers")));
  }

  async validateWallet(walletAddress: string): Promise<WalletValidation> {
    return toWalletValidation(await this.json(await this.request(`/wallet-validation?url=${enc(walletAddress)}`)));
  }

  async createSupplier(input: SupplierInput): Promise<Supplier> {
    const response = await this.send("POST", "/suppliers", { name: input.name, category: input.category, wallet_address: input.walletAddress });
    return toSupplier(await this.json(response));
  }

  async listSupplierPayments(supplierId: string): Promise<SupplierPayment[]> {
    return toSupplierPayments(await this.json(await this.request(`/supplier/payments?supplier_id=${enc(supplierId)}`)));
  }

  async getMilestoneLines(milestoneId: string): Promise<MilestoneLines | null> {
    const response = await this.request(`/milestone-lines?milestone_id=${enc(milestoneId)}`);
    if (response.status === 404) return null;
    return toMilestoneLines(await this.json(response));
  }

  async getProjectLines(projectId: string): Promise<ProjectLines | null> {
    const response = await this.request(`/projects/${enc(projectId)}/milestone-lines`);
    if (response.status === 404) return null;
    return toProjectLines(await this.json(response));
  }

  async addLine(milestoneId: string, input: LineInput): Promise<PaymentLine> {
    return toLine(await this.json(await this.send("POST", "/milestone-lines", { milestone_id: milestoneId, ...lineBody(input) })));
  }

  async updateLine(lineId: string, input: LineInput): Promise<PaymentLine> {
    return toLine(await this.json(await this.send("PATCH", `/milestone-lines/${enc(lineId)}`, lineBody(input))));
  }

  async removeLine(lineId: string): Promise<void> {
    await this.json(await this.send("DELETE", `/milestone-lines/${enc(lineId)}`));
  }

  async markPaid(lineId: string): Promise<PaymentLine> {
    return toLine(await this.json(await this.send("POST", `/milestone-lines/${enc(lineId)}/mark-paid`)));
  }

  async retryPayment(milestoneId: string, lineId: string): Promise<PaymentLine> {
    return toLine(await this.json(await this.send("POST", `/milestone-lines/${enc(lineId)}/retry`, { milestone_id: milestoneId })));
  }
}
