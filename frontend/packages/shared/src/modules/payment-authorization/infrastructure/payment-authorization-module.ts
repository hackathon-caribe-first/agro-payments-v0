import { getProjectAuthorizations } from "../application/use-cases";
import { HttpPaymentAuthorizationRepository } from "./http-payment-authorization-repository";

interface Options {
  fetchFn: typeof fetch;
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api";

// Composition root of the payment authorization read side.
export function createPaymentAuthorizationModule({ fetchFn, baseUrl = DEFAULT_BASE_URL }: Options) {
  const repo = new HttpPaymentAuthorizationRepository({ baseUrl, fetchFn });
  return {
    getProjectAuthorizations: (projectId: string) => getProjectAuthorizations(repo, projectId),
  };
}

export type PaymentAuthorizationModule = ReturnType<typeof createPaymentAuthorizationModule>;
