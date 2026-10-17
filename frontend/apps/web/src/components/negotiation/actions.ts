import type { PresaleResult } from "@agro/shared/modules/presales/domain/errors";
import { toActionData, type PresaleActionData } from "~/components/presale/error-copy";

// The verbs a party can perform on a negotiation. Buyer and producer modules each bind them to their own identity,
// so the route action only maps form intents to calls and the Result to the action response.
export interface NegotiationApi {
  accept(revision: unknown): Promise<PresaleResult<unknown>>;
  reject(revision: unknown): Promise<PresaleResult<unknown>>;
  counter(raw: unknown): Promise<PresaleResult<unknown>>;
  withdraw(): Promise<PresaleResult<unknown>>;
  // Producer-only, for a fresh request.
  respond?(raw: unknown): Promise<PresaleResult<unknown>>;
  decline?(): Promise<PresaleResult<unknown>>;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export function offerFields(form: FormData) {
  return {
    unitPrice: text(form, "unitPrice"),
    quantity: text(form, "quantity"),
    validUntil: text(form, "validUntil"),
    deliveryDate: text(form, "deliveryDate"),
    deliveryTerms: text(form, "deliveryTerms"),
  };
}

// One use case per intent.
export async function runNegotiationAction(api: NegotiationApi, form: FormData): Promise<PresaleActionData> {
  const intent = form.get("intent");
  let result: PresaleResult<unknown> | null = null;

  if (intent === "accept") result = await api.accept(form.get("revision"));
  else if (intent === "reject") result = await api.reject(form.get("revision"));
  else if (intent === "counter") result = await api.counter(offerFields(form));
  else if (intent === "withdraw") result = await api.withdraw();
  else if (intent === "respond" && api.respond) result = await api.respond(offerFields(form));
  else if (intent === "decline" && api.decline) result = await api.decline();

  if (!result) return { fieldErrors: { _form: ["Acción desconocida."] } };
  return result.ok ? { fieldErrors: {} } : toActionData(result.error);
}
