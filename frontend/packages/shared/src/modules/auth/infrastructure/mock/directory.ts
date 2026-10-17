import { INVESTOR_IDENTITY, PRODUCER_IDENTITY, VERIFIER_IDENTITY } from "../../../presales/infrastructure/mock/identities";
import type { SessionDto } from "../dto";

// Local directory of accounts: exactly one per role, mapped to the fixed identities every module already uses.
// Keep BUYER_ID in sync with BUYER_PROFILE (apps/web/src/buyer/module.ts) and SUPPLIER_ID with the seeded supplier of
// payment-lines/infrastructure/mock/fixtures.ts. It holds no passwords: signing in checks the account email only.
export const BUYER_ID = "buyer-andina";
export const SUPPLIER_ID = "sup-agroinsumos-huila";

export const MOCK_ACCOUNTS: readonly SessionDto[] = [
  { user_id: "usr-producer", name: PRODUCER_IDENTITY.name, email: "productor@agricolalaesperanza.co", role: "PRODUCER", profile_id: PRODUCER_IDENTITY.id },
  { user_id: "usr-investor", name: INVESTOR_IDENTITY.name, email: "inversor@capitalverde.co", role: "INVESTOR", profile_id: INVESTOR_IDENTITY.id },
  { user_id: "usr-verifier", name: VERIFIER_IDENTITY.name, email: "camila.rojas@surco.co", role: "VERIFIER", profile_id: VERIFIER_IDENTITY.id },
  { user_id: "usr-buyer", name: "Comercializadora Andina S.A.S.", email: "compras@comercializadoraandina.co", role: "BUYER", profile_id: BUYER_ID },
  { user_id: "usr-supplier", name: "Agroinsumos del Huila", email: "ventas@agroinsumoshuila.co", role: "SUPPLIER", profile_id: SUPPLIER_ID },
  { user_id: "usr-operator", name: "Operación Surco", email: "operaciones@surco.co", role: "OPERATOR", profile_id: "operator-surco" },
];
