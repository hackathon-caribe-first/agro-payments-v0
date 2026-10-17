import { createAppMockTransport } from "@agro/shared/modules/presales/infrastructure/mock/transport";

// ONE transport for the whole app: the producer, presales and buyer modules all talk through it, so they see the same data.
// VITE_MILESTONES_SOURCE = "mock" (default) | "http".
export const API_SOURCE = import.meta.env.VITE_MILESTONES_SOURCE;
export const API_BASE_URL = import.meta.env.VITE_MILESTONES_BASE_URL;

export const transport: typeof fetch =
  API_SOURCE === "http" ? (...args: Parameters<typeof fetch>) => fetch(...args) : createAppMockTransport();
