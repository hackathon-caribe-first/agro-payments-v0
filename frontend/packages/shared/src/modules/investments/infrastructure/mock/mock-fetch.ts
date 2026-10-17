import type { ProjectDto } from "../../../projects/infrastructure/dto";
import type { CaptureDto, InvestmentDto } from "../dto";

// The slice of the shared mock store the investor side needs (the same projects array the other handlers use).
export interface InvestmentsMockStore {
  projects: ProjectDto[];
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rejected = (message: string) => json({ error: "Request rejected", errors: { _form: [message] } }, 409);

// The backend's simulated mode, kept minimal: captures at once, COP per unit of the wallet's currency (read from a _usd / -eur
// suffix of the wallet URL), 10 % per-investor cap. One demo investor.
const RATES: Record<string, number> = { COP: 1, USD: 4_000, EUR: 4_400 };
const CAP_PCT = 10;
const FUNDABLE = ["DRAFT", "CONTRACT_SIGNED", "FUNDING_IN_PROGRESS"];
const INVESTOR_ID = "investor-demo";

const currencyOf = (wallet: string) => {
  const suffix = /[-_]([a-z]{3})\/?$/i.exec(new URL(wallet).pathname)?.[1]?.toUpperCase();
  return suffix && suffix in RATES ? suffix : "COP";
};

function captureOf(project: ProjectDto, investments: InvestmentDto[]): CaptureDto {
  const captured = investments.filter((i) => i.project_id === project.id && i.status === "CAPTURED");
  const raised = captured.reduce((sum, i) => sum + i.amount, 0);
  const byCurrency = new Map<string, { debited: bigint; received: number }>();
  for (const i of captured) {
    const code = i.quote?.debit_asset_code ?? "COP";
    const row = byCurrency.get(code) ?? { debited: 0n, received: 0 };
    row.debited += BigInt(i.quote?.debit_amount ?? 0);
    row.received += i.amount;
    byCurrency.set(code, row);
  }
  return {
    target_amount: project.target_amount,
    raised,
    currency: project.currency,
    progress_pct: project.target_amount > 0 ? Math.min(100, Math.floor((raised * 100) / project.target_amount)) : 0,
    investors_count: new Set(captured.map((i) => i.investor_id)).size,
    by_currency: [...byCurrency].map(([currency, r]) => ({ currency, debited: r.debited.toString(), received_cop: r.received })),
  };
}

// /investor/projects[/:id], GET|POST /projects/:id/investments. Everything else goes to the delegate.
export function createInvestmentsMockFetch(store: InvestmentsMockStore, delegate: typeof fetch): typeof fetch {
  const investments: InvestmentDto[] = [];
  const withCapture = (p: ProjectDto) => ({ ...p, capture: captureOf(p, investments) });

  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://mock.local");
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname.replace(/^\/api/, "");

    if (method === "GET" && path === "/investor/projects") {
      return json(store.projects.filter((p) => FUNDABLE.includes(p.current_status)).map(withCapture));
    }
    const one = path.match(/^\/investor\/projects\/([^/]+)$/);
    if (method === "GET" && one) {
      const project = store.projects.find((p) => p.id === one[1]);
      return project ? json(withCapture(project)) : json({ error: "Project not found" }, 404);
    }

    const list = path.match(/^\/projects\/([^/]+)\/investments$/);
    if (list) {
      const project = store.projects.find((p) => p.id === list[1]);
      if (!project) return json({ error: "Project not found" }, 404);
      if (method === "GET") return json(investments.filter((i) => i.project_id === project.id));
      if (method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { amount: number; wallet_address: string };
        if (!FUNDABLE.includes(project.current_status)) return rejected("Este proyecto ya no recibe inversiones.");
        const { raised } = captureOf(project, investments);
        if (body.amount > project.target_amount - raised) return rejected("El monto supera lo que falta por captar en este proyecto.");
        const mine = investments.filter((i) => i.project_id === project.id && i.status === "CAPTURED").reduce((s, i) => s + i.amount, 0);
        if (mine + body.amount > Math.floor((project.target_amount * CAP_PCT) / 100)) {
          return rejected(`Un inversionista no calificado puede aportar como máximo el ${CAP_PCT} % del proyecto.`);
        }
        const currency = currencyOf(body.wallet_address);
        // Minor units (scale 2), rounded up like the backend; mock amounts are small enough for plain numbers.
        const debit = Math.ceil((body.amount * 100) / RATES[currency]);
        const at = new Date().toISOString();
        const id = `inv-${investments.length + 1}`;
        const investment: InvestmentDto = {
          id,
          project_id: project.id,
          investor_id: INVESTOR_ID,
          wallet_address: body.wallet_address,
          status: "CAPTURED",
          failure_reason: null,
          amount: body.amount,
          currency: project.currency,
          quote: { id: `SIM-QUOTE-${id}`, debit_amount: String(debit), debit_asset_code: currency, debit_asset_scale: 2, receive_amount: body.amount, expires_at: null },
          implied_rate: `${body.amount * 100}/${debit}`,
          incoming_payment_id: null,
          outgoing_payment_id: `SIM-CAPTURE-${id}`,
          created_at: at,
          captured_at: at,
        };
        investments.push(investment);
        project.custody_balance += body.amount;
        project.current_status = project.custody_balance >= project.target_amount ? "FUNDED_IN_CUSTODY" : "FUNDING_IN_PROGRESS";
        return json(investment, 201);
      }
    }

    return delegate(input, init);
  };
}
