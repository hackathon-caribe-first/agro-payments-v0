import { ValidationFailure } from "../../milestones/domain/errors";
import { HttpMilestoneRepository } from "../../milestones/infrastructure/http-milestone-repository";
import { createMilestonesModule } from "../../milestones/infrastructure/milestones-module";
import { createMockFetch } from "../../milestones/infrastructure/mock/mock-fetch";
import { WALLET_URL_INVALID, normalizeWalletUrl, walletProblem } from "../../payment-lines/domain/supplier";
import { HttpPaymentLinesRepository } from "../../payment-lines/infrastructure/http-payment-lines-repository";
import type { WalletValidator } from "../application/wallet-validator";
import { createProject, getProducerDashboard, getProjectWithMilestones, validateProducerWallet } from "../application/use-cases";
import { HttpProjectRepository } from "./http-project-repository";
import { createProjectsMockFetch } from "./mock/mock-fetch";
import { createProducerMockStore } from "./mock/store";

interface Options {
  source?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

const DEFAULT_BASE_URL = "/api";

// Projects and milestones handlers share the SAME arrays, so created projects resolve everywhere.
function createMockTransport(): typeof fetch {
  const store = createProducerMockStore();
  return createProjectsMockFetch(store, createMockFetch(store.milestones));
}

// RF-01: wallet validation over `GET /wallet-validation?url=` (payment lines transport), against the platform currency.
function createWalletValidator(baseUrl: string, fetchFn: typeof fetch): WalletValidator {
  const lines = new HttpPaymentLinesRepository({ baseUrl, fetchFn });
  return {
    async check(walletAddress) {
      try {
        const validation = await lines.validateWallet(walletAddress);
        const problem = walletProblem(validation);
        if (problem) return { valid: false, message: problem };
        return {
          valid: true,
          url: normalizeWalletUrl(walletAddress) ?? walletAddress.trim(),
          assetCode: validation.assetCode,
          assetScale: validation.assetScale,
          publicName: validation.publicName,
        };
      } catch (cause) {
        // 400: invalid URL or a provider the platform has not enabled.
        if (cause instanceof ValidationFailure) {
          return { valid: false, message: cause.fieldErrors.walletAddress?.[0] ?? cause.fieldErrors._form?.[0] ?? WALLET_URL_INVALID };
        }
        throw cause;
      }
    },
  };
}

// http mode: our backend has no /wallet-validation; it validates the wallet itself (GET of the wallet address, Open Payments
// mode) when the project is created. The form only checks the address shape here.
function createFormatOnlyWalletValidator(): WalletValidator {
  return {
    async check(walletAddress) {
      const url = normalizeWalletUrl(walletAddress);
      if (!url) return { valid: false, message: WALLET_URL_INVALID };
      return { valid: true, url, assetCode: "COP", assetScale: 0, publicName: url.replace(/^https:\/\//, "") };
    },
  };
}

// Composition root for the producer area: projects and milestones share one transport.
export function createProducerModule({ source, baseUrl = DEFAULT_BASE_URL, fetchFn }: Options = {}) {
  const transport = fetchFn ?? (source === "http" ? (...args: Parameters<typeof fetch>) => fetch(...args) : createMockTransport());

  const milestones = createMilestonesModule({ source, baseUrl, fetchFn: transport });
  const repositories = {
    projects: new HttpProjectRepository({ baseUrl, fetchFn: transport }),
    milestones: new HttpMilestoneRepository({ baseUrl, fetchFn: transport }),
    wallets: source === "http" ? createFormatOnlyWalletValidator() : createWalletValidator(baseUrl, transport),
  };

  return {
    milestones,
    getProducerDashboard: () => getProducerDashboard(repositories),
    getProjectWithMilestones: (projectId: string) => getProjectWithMilestones(repositories, projectId),
    // The project form requires the producer wallet (RF-01).
    createProject: (raw: unknown, options?: { requireProducerWallet?: boolean }) => createProject(repositories, raw, options),
    validateProducerWallet: (walletAddress: string) => validateProducerWallet(repositories, walletAddress),
  };
}

export type ProducerModule = ReturnType<typeof createProducerModule>;
