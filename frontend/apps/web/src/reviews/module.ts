import { createReviewsModule } from "@agro/shared/modules/reviews/infrastructure/reviews-module";
import { API_BASE_URL, transport } from "~/platform/transport";

// There is no authentication yet: the verifier is a fixed profile assigned to the local producer's projects.
//
// INTEGRATION: ~/platform/transport.ts must chain `createReviewsMockFetch` (from
// "@agro/shared/modules/reviews/infrastructure/mock/mock-fetch") so /reviews/** and /notifications/** are answered.
// See routes/review.integration.md.
export const reviews = createReviewsModule({ fetchFn: transport, baseUrl: API_BASE_URL });

export const VERIFIER = reviews.verifier;
