import { createReviewsModule } from "@agro/shared/modules/reviews/infrastructure/reviews-module";
import { API_BASE_URL, IS_HTTP, prototypeTransport, transport } from "~/platform/transport";

// There is no authentication yet: the verifier is a fixed profile assigned to the local producer's projects.
//
// INTEGRATION: ~/platform/transport.ts must chain `createReviewsMockFetch` (from
// "@agro/shared/modules/reviews/infrastructure/mock/mock-fetch") so /reviews/** and /notifications/** are answered.
// See routes/review.integration.md.
// In http mode the review queue and dictamen stay on the prototype mock, while the notices (sidebar badges, notifications
// pages) come from our backend's /api/notifications for the signed-in user.
export const reviews = createReviewsModule({
  fetchFn: prototypeTransport,
  baseUrl: API_BASE_URL,
  ...(IS_HTTP && { backendNotifications: { fetchFn: transport, baseUrl: API_BASE_URL } }),
});

export const VERIFIER = reviews.verifier;
