import { createAppMockTransport } from "@agro/shared/modules/presales/infrastructure/mock/transport";

// ONE transport for the whole app: the producer, presales and buyer modules all talk through it, so they see the same data.
// VITE_MILESTONES_SOURCE = "mock" (default) | "http".
export const API_SOURCE = import.meta.env.VITE_MILESTONES_SOURCE;
export const API_BASE_URL = import.meta.env.VITE_MILESTONES_BASE_URL;
export const IS_HTTP = API_SOURCE === "http";

export const transport: typeof fetch = IS_HTTP ? (...args: Parameters<typeof fetch>) => fetch(...args) : createAppMockTransport();

// Areas our backend does not serve yet (harvest batches and orders, investment proposals, grants, verifier reviews, payment
// lines, reconciliation, statements, trace, audit, investor panel): in http mode they keep running on their own in-browser mock
// so the screens stay usable; in mock mode they share the one mock above. Swap a module to `transport` once its endpoints exist.
export const prototypeTransport: typeof fetch = IS_HTTP ? createAppMockTransport() : transport;
