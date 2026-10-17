import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { HarvestError, HarvestResult } from "@agro/shared/modules/harvest/domain/errors";

// `intent` echoes which form of the page the answer belongs to (a page can hold several forms).
export type HarvestActionData = { fieldErrors: FieldErrors; intent?: string; done?: string };

export function harvestErrorMessage(error: HarvestError): string {
  switch (error.kind) {
    case "not_found":
      return "No encontramos este registro.";
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos datos con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
  }
}

export function toActionData(error: HarvestError, intent?: string): HarvestActionData {
  if (error.kind === "validation") return { fieldErrors: error.fieldErrors, intent };
  return { fieldErrors: { [FORM_LEVEL_KEY]: [harvestErrorMessage(error)] }, intent };
}

// Maps a use case Result to what a route action returns when it stays on the page.
export function answer(result: HarvestResult<unknown>, intent: string): HarvestActionData {
  return result.ok ? { fieldErrors: {}, intent, done: intent } : toActionData(result.error, intent);
}

// Hands a form only the answers addressed to it.
export function forIntent(actionData: HarvestActionData | undefined, ...intents: string[]): HarvestActionData | undefined {
  return actionData && actionData.intent && intents.includes(actionData.intent) ? actionData : undefined;
}

// Loader helper: 404 stays a 404, everything else is a 502 with a readable message.
export function loaderFailure(error: HarvestError): Response {
  return new Response(harvestErrorMessage(error), { status: error.kind === "not_found" ? 404 : 502 });
}

export function unwrap<T>(result: HarvestResult<T>): T {
  if (!result.ok) throw loaderFailure(result.error);
  return result.value;
}

// Every `name -> string` entry of a form (the use case schemas pick the ones they need), without the routing `intent`.
export function formFields(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) if (name !== "intent" && typeof value === "string") fields[name] = value;
  return fields;
}
