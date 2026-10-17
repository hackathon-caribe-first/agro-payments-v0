import type { OpsError } from "@agro/shared/modules/panel/domain/errors";
import type { PaymentStepsFilter, PaymentStepsView } from "@agro/shared/modules/trace/domain/payment-steps";
import { opsErrorMessage } from "~/panel/error-copy";
import { trace } from "~/trace/module";

// A 401/403 reads as a permission problem, not as a broken connection.
const stepsErrorMessage = (error: OpsError): string =>
  error.kind === "network" && error.status === 401
    ? "Inicia sesión para ver la traza de pagos."
    : error.kind === "network" && error.status === 403
      ? "Tu rol no puede ver la traza de pagos. Solo operación y fiduciaria tienen acceso."
      : opsErrorMessage(error);

const EMPTY_STEPS: PaymentStepsView = { payments: [], total: 0, projects: [], projectLabels: {}, kinds: [] };

export type PaymentStepsTraceData = { filter: PaymentStepsFilter; view: PaymentStepsView; error: string | null };

/** The real payment-steps log for the URL's ?project= and ?kind=. Errors stay inline instead of throwing to the ErrorBoundary. */
export async function loadPaymentStepsTrace(params: URLSearchParams): Promise<PaymentStepsTraceData> {
  const filter = { projectId: params.get("project") || undefined, kind: params.get("kind") || undefined };
  const result = await trace.loadPaymentSteps(filter);
  return { filter, view: result.ok ? result.value : EMPTY_STEPS, error: result.ok ? null : stepsErrorMessage(result.error) };
}
