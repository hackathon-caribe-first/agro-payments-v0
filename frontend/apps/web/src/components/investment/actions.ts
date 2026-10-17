import type { InvestmentResult } from "@agro/shared/modules/investment-proposals/domain/errors";
import { toActionData, type InvestmentActionData } from "./error-copy";

// The verbs a party can perform on a proposal. The investor and producer modules each bind them to their own identity,
// so the route action only maps form intents to calls and the Result to the action response.
export interface ProposalApi {
  accept(revision: unknown): Promise<InvestmentResult<unknown>>;
  reject(revision: unknown): Promise<InvestmentResult<unknown>>;
  counter(raw: unknown): Promise<InvestmentResult<unknown>>;
  // Investor only: the producer's way out is rejecting on their turn.
  withdraw?(): Promise<InvestmentResult<unknown>>;
}

// Every text field of the form: the domain schema picks the ones it needs.
export function formFields(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) if (name !== "intent" && typeof value === "string") fields[name] = value;
  return fields;
}

// One use case per intent.
export async function runProposalAction(api: ProposalApi, form: FormData): Promise<InvestmentActionData> {
  const intent = form.get("intent");
  let result: InvestmentResult<unknown> | null = null;

  if (intent === "accept") result = await api.accept(form.get("revision"));
  else if (intent === "reject") result = await api.reject(form.get("revision"));
  else if (intent === "counter") result = await api.counter(formFields(form));
  else if (intent === "withdraw" && api.withdraw) result = await api.withdraw();

  if (!result) return { fieldErrors: { _form: ["Acción desconocida."] } };
  return result.ok ? { fieldErrors: {} } : toActionData(result.error);
}

export async function runSignAction(sign: () => Promise<InvestmentResult<unknown>>, form: FormData): Promise<InvestmentActionData> {
  if (form.get("intent") !== "sign") return { fieldErrors: { _form: ["Acción desconocida."] } };
  const result = await sign();
  return result.ok ? { fieldErrors: {} } : toActionData(result.error);
}
