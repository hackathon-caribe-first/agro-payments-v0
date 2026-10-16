import { loadEnv } from "../../../shared/config/env";
import { createBetterAuth } from "./better-auth.factory";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

// Creates the first admin (`pnpm auth:seed-admin`). Idempotent: an existing user just gets role=admin.
async function seed() {
  const env = loadEnv();
  // Better Auth stores emails lowercased and the raw adapter update matches them verbatim.
  const email = required("ADMIN_EMAIL").toLowerCase();
  const auth = createBetterAuth(env);
  const { adapter, internalAdapter } = await auth.$context;

  if (!(await internalAdapter.findUserByEmail(email))) {
    // Sign-up only accepts self-selectable roles, so the user starts as buyer and is promoted below.
    await auth.api.signUpEmail({
      body: { email, password: required("ADMIN_PASSWORD"), name: required("ADMIN_NAME"), role: "buyer" },
    });
  }
  // The raw adapter skips databaseHooks, which block role changes from public endpoints.
  await adapter.update({ model: "user", where: [{ field: "email", value: email }], update: { role: "admin" } });
  console.log(`Admin ready: ${email}`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
