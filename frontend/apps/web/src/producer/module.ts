import { createProducerModule } from "@agro/shared/modules/projects/infrastructure/producer-module";
import { API_BASE_URL, API_SOURCE, transport } from "~/platform/transport";
import { FIXTURE_PHOTO_URLS } from "@agro/shared/modules/milestones/infrastructure/mock/fixtures";

// Single composition point for the producer area. VITE_MILESTONES_SOURCE = "mock" (default) | "http".
export const producer = createProducerModule({
  source: API_SOURCE,
  baseUrl: API_BASE_URL,
  fetchFn: transport,
});

export const milestones = producer.milestones;

// Photos a producer can attach to a field log (no upload in this slice).
export const PHOTO_OPTIONS = FIXTURE_PHOTO_URLS;

export const DASHBOARD_CURRENCY = "COP";
