import type { PresaleResult } from "@agro/shared/modules/presales/domain/errors";
import { toActionData, type PresaleActionData } from "~/components/presale/error-copy";

// The verbs a party can perform on a negotiation. Buyer and producer modules each bind them to their own identity,
// so the route action only maps form intents to calls and the Result to the action response.
export interface NegotiationApi {
  // `raw` carries the total the user saw ({ expectedTotal }) when a PROJECT offer is accepted.
  accept(revision: unknown, raw: unknown): Promise<PresaleResult<unknown>>;
  reject(revision: unknown): Promise<PresaleResult<unknown>>;
  counter(raw: unknown): Promise<PresaleResult<unknown>>;
  withdraw(): Promise<PresaleResult<unknown>>;
  // Buyer-only: executes the pending payment authorization of an agreed PROJECT negotiation.
  authorizePayment?(raw: unknown): Promise<PresaleResult<unknown>>;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

// Every text field of the form (terms differ by scope: the domain schema picks the ones it needs).
export function offerFields(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) if (name !== "intent" && typeof value === "string") fields[name] = value;
  return fields;
}

// One use case per intent.
export async function runNegotiationAction(api: NegotiationApi, form: FormData): Promise<PresaleActionData> {
  const intent = form.get("intent");
  let result: PresaleResult<unknown> | null = null;

  if (intent === "accept") result = await api.accept(form.get("revision"), { expectedTotal: text(form, "expectedTotal") || undefined });
  else if (intent === "reject") result = await api.reject(form.get("revision"));
  else if (intent === "counter") result = await api.counter(offerFields(form));
  else if (intent === "withdraw") result = await api.withdraw();
  else if (intent === "authorize-payment" && api.authorizePayment) result = await api.authorizePayment({ expectedTotal: text(form, "expectedTotal") });

  if (!result) return { fieldErrors: { _form: ["Acción desconocida."] } };
  return result.ok ? { fieldErrors: {} } : toActionData(result.error);
}
