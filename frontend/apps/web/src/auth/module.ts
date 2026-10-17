import { createAuthModule } from "@agro/shared/modules/auth/infrastructure/auth-module";
import { API_BASE_URL, API_SOURCE, IS_HTTP, transport } from "~/platform/transport";

// mock (default): the signed-in account id lives in localStorage. http: Better Auth on our backend (session cookie,
// GET /api/users/me), see HttpAuthRepository.
export const auth = createAuthModule({ source: API_SOURCE, baseUrl: API_BASE_URL, fetchFn: transport });

// The sign-in form asks for a password only against the backend.
export const ASKS_PASSWORD = IS_HTTP;

// ponytail: demo only. The password the seeded demo accounts share, prefilled in the sign-in form in http mode; never in production.
export const DEMO_PASSWORD = "Agro-demo-2026";
