import { data } from "react-router";
import type { OpsError, OpsResult } from "@agro/shared/modules/panel/domain/errors";

// Typed errors of the operations & transparency modules become es-CO copy.
export function opsErrorMessage(error: OpsError): string {
  switch (error.kind) {
    case "not_found":
      return "No encontramos lo que buscas.";
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos datos con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
  }
}

// Loader helper: not found -> 404 page, anything else -> 502 with the es-CO message.
export function unwrapOps<T>(result: OpsResult<T>): T {
  if (result.ok) return result.value;
  if (result.error.kind === "not_found") throw data(null, { status: 404 });
  throw new Response(opsErrorMessage(result.error), { status: 502 });
}
