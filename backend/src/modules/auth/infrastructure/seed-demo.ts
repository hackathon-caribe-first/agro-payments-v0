import { loadEnv } from "../../../shared/config/env";
import { DEMO_PARTIES } from "../application/demo-parties";
import type { Role } from "../ports/role";
import { createBetterAuth } from "./better-auth.factory";

// ponytail: demo only (DEMO_IDENTITY=true), never in production. The mock-mode sign-in password (frontend/apps/web/src/auth/module.ts).
const DEMO_PASSWORD = "Agro-demo-2026";

// The accounts the web sign-in lists (frontend/packages/shared/src/modules/auth/infrastructure/http-auth-repository.ts).
const DEMO_ACCOUNTS: { email: string; name: string; role: Role }[] = [
  { email: DEMO_PARTIES.producer.email, name: "Agrícola La Esperanza S.A.S.", role: DEMO_PARTIES.producer.role },
  { email: DEMO_PARTIES.buyer.email, name: "Comercializadora Andina S.A.S.", role: DEMO_PARTIES.buyer.role },
  { email: DEMO_PARTIES.investor.email, name: "Capital Verde Inversiones S.A.S.", role: DEMO_PARTIES.investor.role },
  { email: "verificador@agro.dev", name: "Camila Rojas", role: "verifier" },
  { email: "fiduciaria@agro.dev", name: "Operación Surco", role: "fidu" },
];

// Creates the demo accounts (`pnpm auth:seed-demo`). Idempotent: existing users only get their role back.
async function seed() {
  const auth = createBetterAuth(loadEnv());
  const { adapter, internalAdapter } = await auth.$context;

  for (const { email, name, role } of DEMO_ACCOUNTS) {
    if (!(await internalAdapter.findUserByEmail(email))) {
      // Sign-up only accepts self-selectable roles, so every account starts as buyer and gets its role below.
      await auth.api.signUpEmail({ body: { email, password: DEMO_PASSWORD, name, role: "buyer" } });
    }
    // The raw adapter skips databaseHooks, which block role changes from public endpoints.
    await adapter.update({ model: "user", where: [{ field: "email", value: email }], update: { role } });
  }
  console.log(`Demo accounts ready: ${DEMO_ACCOUNTS.map((account) => account.email).join(", ")}`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
