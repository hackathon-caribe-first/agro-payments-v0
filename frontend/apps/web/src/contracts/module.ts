import { redirect } from "react-router";
import type { ClaimTrigger, ContractCurrency, ContractUnit } from "@agro/shared/modules/contracts/domain/contracts";
import { type ContractsError, createContractsModule } from "@agro/shared/modules/contracts/infrastructure/contracts-module";
import type { FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { API_BASE_URL, transport } from "~/platform/transport";

// Contracts and insurance (RF-04, RF-05, RF-09, RF-14, RF-25) over the same transport as the rest of the app (mock or http).
export const contracts = createContractsModule({ fetchFn: transport, baseUrl: API_BASE_URL });

export type ContractsActionData = { ok: true; intent: string } | { ok: false; intent: string; message: string; fieldErrors?: FieldErrors };

export function contractsErrorMessage(error: ContractsError): string {
  switch (error.kind) {
    case "rejected":
      return error.message;
    case "validation":
      return "Revisa los campos marcados e intenta de nuevo.";
    case "boundary":
      return "Recibimos los datos con un formato inesperado. Intenta de nuevo en unos minutos.";
    case "network":
      return "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
  }
}

/** Every read of the screen; a part that fails to load shows as missing instead of breaking the page. */
export async function loadContracts(projectId: string) {
  const [purchase, policy, contract, claims] = await Promise.all([
    contracts.getPurchaseContract(projectId),
    contracts.getPolicy(projectId),
    contracts.getContract(projectId),
    contracts.listClaims(projectId),
  ]);
  return {
    purchase: purchase.ok ? purchase.value : null,
    policy: policy.ok ? policy.value : null,
    contract: contract.ok ? contract.value : null,
    claims: claims.ok ? claims.value : [],
  };
}

const number = (form: FormData, name: string): number | undefined => {
  const raw = String(form.get(name) ?? "").trim().replace(",", ".");
  return raw === "" ? undefined : Number(raw);
};
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function contractsAction(projectId: string, request: Request): Promise<ContractsActionData | Response> {
  const form = await request.formData();
  const intent = text(form, "intent");
  const done = <T>(result: { ok: true; value: T } | { ok: false; error: ContractsError }): ContractsActionData =>
    result.ok
      ? { ok: true, intent }
      : { ok: false, intent, message: contractsErrorMessage(result.error), fieldErrors: result.error.kind === "validation" ? result.error.fieldErrors : undefined };

  switch (intent) {
    case "save-purchase": {
      const formula = text(form, "price_type") === "formula";
      return done(
        await contracts.savePurchaseContract(projectId, {
          priceType: formula ? "formula" : "fixed",
          ...(formula
            ? { floorPerUnit: number(form, "floor_per_unit"), ceilingPerUnit: number(form, "ceiling_per_unit"), priceReference: text(form, "price_reference") }
            : { pricePerUnit: number(form, "price_per_unit") }),
          quantity: number(form, "quantity") ?? 0,
          unit: text(form, "unit") as ContractUnit,
          currency: text(form, "currency") as ContractCurrency,
          buyerEmail: text(form, "buyer_email"),
          buyerWalletAddress: text(form, "buyer_wallet_address"),
        }),
      );
    }
    case "save-policy":
      return done(
        await contracts.savePolicy(projectId, {
          insurerName: text(form, "insurer_name"),
          insurerWalletAddress: text(form, "insurer_wallet_address"),
          premium: number(form, "premium"),
          subsidyPct: number(form, "subsidy_pct"),
          thresholdPct: number(form, "threshold_pct"),
          deductiblePct: number(form, "deductible_pct"),
          hectares: number(form, "hectares"),
          expectedYieldKgPerHa: number(form, "expected_yield_kg_per_ha"),
          insuredPricePerKg: number(form, "insured_price_per_kg"),
          indexTrigger: number(form, "index_trigger"),
          indexExit: number(form, "index_exit"),
        }),
      );
    case "premium-grant": {
      const result = await contracts.startPremiumGrant(projectId);
      // Open-payments mode: the fiduciaria approves in the custody wallet, which sends the browser back to /custodian.
      if (result.ok && result.value) return redirect(result.value);
      return done(result);
    }
    case "pay-premium":
      return done(await contracts.payPremium(projectId));
    case "file-claim":
      return done(
        await contracts.fileClaim(projectId, { trigger: text(form, "trigger") as ClaimTrigger, observedValue: number(form, "observed_value") ?? Number.NaN, evidence: text(form, "evidence") }),
      );
    case "confirm-claim":
      return done(await contracts.confirmClaim(projectId, text(form, "claim_id")));
    case "generate-contract":
      return done(await contracts.generateContract(projectId));
    case "sign":
      return done(await contracts.sign(text(form, "contract_id")));
    default:
      return { ok: false, intent, message: "Acción desconocida." };
  }
}
