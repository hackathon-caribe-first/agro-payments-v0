import type { LedgerEntryDto } from "../../../escrow/infrastructure/dto";
import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { ClaimDto, ContractDto, PolicyDto, PurchaseContractDto } from "../dto";

// The slice of the shared mock store the contracts need: the projects (status, custody) and the escrow ledger.
export interface ContractsMockStore {
  projects: ProjectDto[];
  externalProjects: ProjectDto[];
  ledgerEntries: LedgerEntryDto[];
}

type Body = Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rejected = (message: string) => json({ error: "Request rejected", errors: { _form: [message] } }, 409);
const invalid = (errors: Record<string, string[]>) => json({ error: "Invalid payload", errors }, 400);
const notFound = () => json({ error: "Not found", errors: {} }, 404);
const https = (v: unknown) => typeof v === "string" && v.startsWith("https://");
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const now = () => new Date().toISOString();
const roundPeso = (n: number) => Math.round(n);

// ponytail: a minimal stand-in for mock mode. It skips the buyer lookup and the simulation (missing premium terms take the P2
// demo's), acts as every party when signing, and pays the premium at once like the simulated gateway.
export function createContractsMockFetch(store: ContractsMockStore, delegate: typeof fetch): typeof fetch {
  const purchases = new Map<string, PurchaseContractDto>();
  const policies = new Map<string, PolicyDto>();
  const claims = new Map<string, ClaimDto[]>();
  const contracts = new Map<string, ContractDto[]>();

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");
    const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Body;

    const sign = path.match(/^\/contracts\/([^/]+)\/signatures$/);
    if (sign && method === "POST") {
      const doc = [...contracts.values()].flat().find((d) => d.id === decodeURIComponent(sign[1]));
      if (!doc) return notFound();
      const party = doc.parties.find((p) => !p.signed);
      if (!party) return rejected("Ya firmaste este contrato.");
      party.signed = true;
      doc.signatures.push({ party_role: party.role, signed_at: now() });
      doc.signable_roles = doc.parties.filter((p) => !p.signed).map((p) => p.role);
      if (doc.signable_roles.length === 0) {
        doc.status = "signed";
        const project = store.projects.find((p) => p.id === doc.project_id);
        if (project?.current_status === "DRAFT") project.current_status = "CONTRACT_SIGNED";
      }
      return json(doc, 201);
    }

    const match = path.match(/^\/projects\/([^/]+)\/(purchase-contract|insurance-policy|contract)(\/.*)?$/);
    if (!match) return delegate(input, init);
    const projectId = decodeURIComponent(match[1]);
    const project = [...store.projects, ...store.externalProjects].find((p) => p.id === projectId);
    if (!project) return notFound();
    const [, , resource, rest = ""] = match;

    if (resource === "purchase-contract") {
      if (method === "GET") return purchases.has(projectId) ? json(purchases.get(projectId)) : notFound();
      const errors: Record<string, string[]> = {};
      if (!https(body.buyer_wallet_address)) errors.buyer_wallet_address = ["Ingresa una dirección de wallet https."];
      if (typeof body.buyer_email !== "string" || !body.buyer_email.includes("@")) errors.buyer_email = ["Ingresa el correo del comprador."];
      if (!(num(body.quantity, 0) > 0)) errors.quantity = ["Ingresa una cantidad entera mayor a cero."];
      if (Object.keys(errors).length > 0) return invalid(errors);
      if (!["DRAFT", "CONTRACT_SIGNED"].includes(project.current_status)) return rejected("El contrato de compra se fija antes de publicar el proyecto.");
      const formula = body.price_type === "formula";
      const contract: PurchaseContractDto = {
        project_id: projectId,
        price_type: formula ? "formula" : "fixed",
        price_per_unit: formula ? null : num(body.price_per_unit, 0),
        floor_per_unit: formula ? num(body.floor_per_unit, 0) : null,
        ceiling_per_unit: formula ? num(body.ceiling_per_unit, 0) : null,
        price_reference: formula ? String(body.price_reference ?? "") : null,
        quantity: num(body.quantity, 0),
        unit: body.unit === "t" ? "t" : "kg",
        currency: body.currency === "USD" ? "USD" : "COP",
        settles: body.currency !== "USD",
        buyer_name: "Comprador de demostración",
        buyer_email: String(body.buyer_email).trim().toLowerCase(),
        buyer_wallet_address: String(body.buyer_wallet_address),
        updated_at: now(),
      };
      purchases.set(projectId, contract);
      return json(contract);
    }

    if (resource === "contract") {
      const versions = contracts.get(projectId) ?? [];
      if (method === "GET") return versions.length > 0 ? json(versions.at(-1)) : notFound();
      const purchase = purchases.get(projectId);
      if (!purchase) return rejected("Registra el contrato de compra antes de generar el contrato.");
      if (versions.length > 0) return json(versions.at(-1));
      const parties = [
        { role: "fiduciaria", name: "Patrimonio autónomo (fiduciaria)", signed: false },
        { role: "producer", name: "Productor", signed: false },
        { role: "buyer", name: purchase.buyer_name ?? "Comprador", signed: false },
      ];
      const doc: ContractDto = {
        id: `mock-contract-${projectId}`,
        project_id: projectId,
        version: 1,
        hash: "mock".padEnd(64, "0"),
        body: `# Contrato de financiación por hitos · ${project.project_code}\n\nProyecto: ${project.title}.\n\n(Contrato de demostración: el modo simulado no renderiza la plantilla completa.)`,
        status: "pending_signatures",
        parties,
        signatures: [],
        signable_roles: parties.map((p) => p.role),
        created_at: now(),
      };
      contracts.set(projectId, [doc]);
      return json(doc);
    }

    // insurance-policy and its sub-resources
    const policy = policies.get(projectId);
    if (rest === "" && method === "GET") return policy ? json(policy) : notFound();
    if (rest === "" && method === "PUT") {
      if (!https(body.insurer_wallet_address)) return invalid({ insurer_wallet_address: ["Ingresa una dirección de wallet https."] });
      if (policy?.premium_payment?.status === "completed") return rejected("La prima ya se pagó desde la custodia: la póliza no se puede cambiar.");
      const premium = num(body.premium, 4_269_720);
      const subsidy = num(body.subsidy_pct, 85);
      const threshold = num(body.threshold_pct, 70);
      const hectares = num(body.hectares, 1);
      const expected = num(body.expected_yield_kg_per_ha, 85_000);
      const price = num(body.insured_price_per_kg, 1300);
      const next: PolicyDto = {
        project_id: projectId,
        insurer_name: String(body.insurer_name ?? ""),
        insurer_wallet_address: String(body.insurer_wallet_address),
        beneficiary: "PATRIMONIO_AUTONOMO",
        source: "input",
        premium,
        subsidy_pct: subsidy,
        net_premium: roundPeso(premium * (1 - subsidy / 100)),
        threshold_pct: threshold,
        threshold_yield_kg_per_ha: (threshold / 100) * expected,
        deductible_pct: num(body.deductible_pct, 10),
        hectares,
        expected_yield_kg_per_ha: expected,
        insured_price_per_kg: price,
        sum_insured: roundPeso(hectares * (threshold / 100) * expected * price),
        index_trigger: typeof body.index_trigger === "number" ? body.index_trigger : null,
        index_exit: typeof body.index_exit === "number" ? body.index_exit : null,
        premium_payment: null,
      };
      policies.set(projectId, next);
      return json(next);
    }
    if (rest === "/premium-grant" && method === "POST") return json({ redirect_url: null });
    if (rest === "/pay-premium" && method === "POST") {
      if (!policy) return rejected("Registra la póliza antes de pagar la prima.");
      if (policy.premium_payment?.status === "completed") return json(policy);
      if (!["FUNDED_IN_CUSTODY", "IN_EXECUTION"].includes(project.current_status)) {
        return rejected("La prima se paga desde la custodia al activar el proyecto: completa la captación primero.");
      }
      if (project.custody_balance < policy.net_premium) return rejected("La custodia no tiene saldo para pagar la prima.");
      project.custody_balance -= policy.net_premium;
      const reference = `SIM-PRIMA-${projectId}`;
      policy.premium_payment = { id: `pay-${projectId}`, amount: policy.net_premium, status: "completed", reference, outgoing_payment_id: null, requested_at: now(), completed_at: now() };
      store.ledgerEntries.push({ id: `led-prima-${projectId}`, project_id: projectId, type: "DEBIT", category: "PREMIUM", amount: policy.net_premium, currency: "COP", negotiation_id: "", buyer_id: "", created_at: now() });
      return json(policy);
    }
    const list = claims.get(projectId) ?? [];
    if (rest === "/claims" && method === "GET") return json(list);
    if (rest === "/claims" && method === "POST") {
      if (!policy || policy.premium_payment?.status !== "completed") return rejected("La póliza no está vigente: la prima se paga desde la custodia antes de reclamar.");
      if (list.length > 0) return rejected("El proyecto ya tiene una reclamación de esta póliza.");
      const observed = num(body.observed_value, Number.NaN);
      if (!(observed >= 0)) return invalid({ observed_value: ["Ingresa el valor observado, cero o mayor."] });
      let amount: number;
      if (body.trigger === "index") {
        if (policy.index_trigger === null || policy.index_exit === null) return rejected("La póliza no tiene un índice paramétrico: reclama por rendimiento.");
        if (observed >= policy.index_trigger) return rejected(`El índice observado no alcanza el disparo de la póliza (${policy.index_trigger}).`);
        amount = roundPeso(policy.sum_insured * Math.min(1, (policy.index_trigger - observed) / (policy.index_trigger - policy.index_exit)));
      } else {
        const threshold = policy.threshold_yield_kg_per_ha;
        if (observed >= threshold) return rejected(`El rendimiento observado no cae del umbral de la póliza (${threshold.toLocaleString("es-CO")} kg/ha).`);
        const deductible = (policy.deductible_pct / 100) * threshold * policy.insured_price_per_kg;
        amount = roundPeso(policy.hectares * Math.max(0, (threshold - observed) * policy.insured_price_per_kg - deductible));
        if (amount <= 0) return rejected("La pérdida no supera el deducible de la póliza: la indemnización es cero.");
      }
      const claim: ClaimDto = {
        id: `claim-${projectId}-${list.length + 1}`,
        trigger: body.trigger === "index" ? "index" : "yield",
        observed_value: observed,
        evidence: String(body.evidence ?? ""),
        amount,
        status: "pending",
        incoming_payment_url: null,
        created_at: now(),
        confirmed_at: null,
      };
      claims.set(projectId, [...list, claim]);
      return json(claim, 201);
    }
    const confirm = rest.match(/^\/claims\/([^/]+)\/confirm$/);
    if (confirm && method === "POST") {
      const claim = list.find((c) => c.id === decodeURIComponent(confirm[1]));
      if (!claim) return notFound();
      if (claim.status !== "confirmed") {
        claim.status = "confirmed";
        claim.confirmed_at = now();
        project.custody_balance += claim.amount;
        store.ledgerEntries.push({ id: `led-${claim.id}`, project_id: projectId, type: "CREDIT", category: "INDEMNITY", amount: claim.amount, currency: "COP", negotiation_id: "", buyer_id: "", created_at: now() });
      }
      return json(claim);
    }
    return delegate(input, init);
  };
}
