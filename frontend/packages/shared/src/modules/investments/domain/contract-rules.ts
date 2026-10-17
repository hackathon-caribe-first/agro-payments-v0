import type { SignBlock } from "./errors";
import type { Contract, ContractMilestone, Party } from "./investment";
import { formatYield, yieldAmount } from "./proposal-rules";

// The contract template (PRD RF-04). Everything here is pure: the same terms always render the same document,
// which is what makes the document hash reproducible.

export type ContractTerms = Pick<
  Contract,
  | "id"
  | "projectId"
  | "projectTitle"
  | "projectCode"
  | "currency"
  | "investorName"
  | "producerName"
  | "amount"
  | "yieldBps"
  | "platformFeePct"
  | "projectTotal"
  | "startDate"
  | "estimatedEndDate"
  | "milestones"
>;

export type MoneyFormatter = (amount: number, currency: string) => string;

// Hash input: plain digits, no locale-dependent grouping.
export const plainMoney: MoneyFormatter = (amount, currency) => `${currency} ${amount}`;

// Hash input keeps the ISO day; the screens pass a localized formatter.
export type DayFormatter = (isoDay: string) => string;
export const plainDay: DayFormatter = (isoDay) => isoDay;

// A name that already ends in a period ("S.A.S.") must not get a second one.
const endSentence = (text: string): string => (text.endsWith(".") ? text : `${text}.`);

export interface Clause {
  title: string;
  body: string;
}

export interface LiquidationStep {
  order: number;
  label: string;
  detail: string;
}

// PRD phase 4: platform fee, investor capital, agreed yield and, last, the producer's net result as the remainder.
export function liquidationSteps(terms: ContractTerms, money: MoneyFormatter = plainMoney): LiquidationStep[] {
  return [
    { order: 1, label: "Comisión de la plataforma", detail: `${terms.platformFeePct} % según la tarifa del proyecto.` },
    { order: 2, label: "Capital del inversor", detail: `${money(terms.amount, terms.currency)} acordados.` },
    {
      order: 3,
      label: "Rendimiento pactado",
      detail: `${formatYield(terms.yieldBps)} sobre el capital, equivalente a ${money(yieldAmount(terms.amount, terms.yieldBps), terms.currency)}.`,
    },
    { order: 4, label: "Utilidad neta del productor", detail: "Es el resto del valor de la venta, una vez pagados los conceptos anteriores." },
  ];
}

const milestoneLine = (m: ContractMilestone, currency: string, money: MoneyFormatter, day: DayFormatter) =>
  `Hito ${m.sequenceOrder} · ${m.title}: tope ${money(m.cap, currency)}${m.dueDate ? `, plazo ${day(m.dueDate)}` : ""}.`;

export function buildContractClauses(terms: ContractTerms, money: MoneyFormatter = plainMoney, day: DayFormatter = plainDay): Clause[] {
  const steps = liquidationSteps(terms, money);
  return [
    {
      title: "1. Partes",
      body: `Inversor: ${endSentence(terms.investorName)} Productor: ${endSentence(terms.producerName)} La plataforma actúa como orquestadora de pagos y no retiene fondos: el dinero se mueve de billetera a billetera.`,
    },
    {
      title: "2. Objeto",
      body: `Financiar por hitos el proyecto «${terms.projectTitle}» (${terms.projectCode}), con inicio el ${day(terms.startDate)} y cierre estimado el ${day(terms.estimatedEndDate)}.`,
    },
    {
      title: "3. Monto y rendimiento",
      body: `El inversor aporta ${money(terms.amount, terms.currency)} sobre un proyecto cotizado en ${money(terms.projectTotal, terms.currency)}. El rendimiento pactado es ${formatYield(terms.yieldBps)} sobre el capital.`,
    },
    {
      title: "4. Hitos y topes",
      body: `${terms.milestones.map((m) => milestoneLine(m, terms.currency, money, day)).join(" ")} Cada hito se paga con una autorización propia cuyo tope es el presupuesto máximo del hito. El dinero permanece en la billetera del inversor hasta cada pago.`,
    },
    {
      title: "5. Regla de liquidación",
      body: `Con la venta de la cosecha se paga en este orden: ${steps.map((s) => `${s.order}) ${s.label}`).join("; ")}.`,
    },
    {
      title: "6. Pérdida",
      body: "Si el valor de la venta no alcanza para cubrir el capital y el rendimiento, el inversor asume la pérdida: los pagos se detienen cuando se agota el valor de la venta.",
    },
    {
      title: "7. Firma",
      body: "El contrato queda firmado cuando el inversor y el productor lo firman digitalmente. Cada firma registra la fecha, la hora y la huella del documento.",
    },
  ];
}

// The exact text that is hashed. Parties, ids and plain amounts only: no timestamps, no signatures.
export function contractDocument(terms: ContractTerms): string {
  const header = `CONTRATO ${terms.id} · PROYECTO ${terms.projectId}`;
  return [header, ...buildContractClauses(terms).map((c) => `${c.title}\n${c.body}`)].join("\n\n");
}

// A party signs once, only while the contract is pending, and only as themselves.
export function signBlock(
  contract: Pick<Contract, "status" | "investorId" | "producerId" | "investorSignature" | "producerSignature">,
  party: Party,
  partyId: string,
): SignBlock | null {
  if (contract.status !== "PENDING_SIGNATURES") return "not_pending";
  if ((party === "INVESTOR" ? contract.investorId : contract.producerId) !== partyId) return "not_party";
  if ((party === "INVESTOR" ? contract.investorSignature : contract.producerSignature) !== null) return "already_signed";
  return null;
}

// Pending until both signatures exist.
export const isFullySigned = (contract: Pick<Contract, "investorSignature" | "producerSignature">): boolean =>
  contract.investorSignature !== null && contract.producerSignature !== null;

export const isContractParty = (contract: Pick<Contract, "investorId" | "producerId">, party: Party, partyId: string): boolean =>
  party === "INVESTOR" ? contract.investorId === partyId : contract.producerId === partyId;
