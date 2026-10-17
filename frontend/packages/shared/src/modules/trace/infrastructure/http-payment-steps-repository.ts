import { JsonReader } from "../../panel/infrastructure/json-reader";
import type { PaymentStepsRepository } from "../application/trace-repository";
import { toPaymentStepRows, toProjectOptions, type PaymentStepRow, type ProjectOption } from "../domain/payment-steps";

interface Options {
  baseUrl?: string;
  fetchFn: typeof fetch;
}

// The backend caps the listing at 500 rows; filters run client side so the project/kind options come from the same rows.
// ponytail: no pagination yet; push project_id/payment_kind to the query once one page stops holding a whole demo.
const LIMIT = 500;

export class HttpPaymentStepsRepository implements PaymentStepsRepository {
  private readonly reader: JsonReader;

  constructor({ baseUrl, fetchFn }: Options) {
    this.reader = new JsonReader({ baseUrl, fetchFn });
  }

  // Unlike the derived trace, a failure here is NOT optional: 401/403 must reach the screen as a permission message.
  async listPaymentSteps(): Promise<PaymentStepRow[]> {
    return toPaymentStepRows(await this.reader.get(`/support/payment-steps?limit=${LIMIT}`));
  }

  // Optional: a 403 (or any failure) degrades to null and the screen keeps the ids from the rows.
  async listProjects(): Promise<ProjectOption[] | null> {
    const raw = await this.reader.getOptional("/projects");
    return raw === null ? null : toProjectOptions(raw);
  }
}
