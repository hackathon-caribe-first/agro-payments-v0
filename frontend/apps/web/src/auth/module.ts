import { createAuthModule } from "@agro/shared/modules/auth/infrastructure/auth-module";

// There is no backend session yet: the mock adapter keeps the signed-in account id in localStorage (memory on the server).
// To use the real backend (Better Auth, /users/me) replace the repository inside createAuthModule; nothing else changes.
export const auth = createAuthModule();
