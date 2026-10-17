import { z } from "zod";
import { formatMoney } from "../../milestones/milestone-state";
import { MAX_YIELD_BPS, counterChangesATerm, formatYield, parseYieldBps } from "../domain/proposal-rules";
import type { ProposalRevision } from "../domain/investment";

export const NO_CHANGE_MESSAGE = "La contraoferta debe cambiar el monto o el rendimiento.";

// Digit strings coming from inputs become numbers; anything else is left for the number check to reject.
const digitsToNumber = (value: unknown) => (typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : value);

// A yield arrives as text from the form ("12,5") or as basis points from the wire (1250).
const yieldToBps = (value: unknown) => (typeof value === "string" ? (parseYieldBps(value) ?? value) : value);

interface Context {
  today: string;
  // Project quotation total: the proposal can never ask for more than the project needs.
  maxAmount: number;
  currency: string;
}

const termsShape = ({ today, maxAmount, currency }: Context) =>
  z.object({
    amount: z.preprocess(
      digitsToNumber,
      z
        .number({ error: "Monto: ingresa un valor numérico." })
        .int({ error: "Monto: ingresa un valor entero." })
        .positive({ error: "Monto: debe ser mayor a cero." })
        .max(maxAmount, { error: `Monto: no puede superar el total de la cotización (${formatMoney(maxAmount, currency)}).` }),
    ),
    yieldPercent: z.preprocess(
      yieldToBps,
      z
        .number({ error: "Rendimiento: ingresa un porcentaje, por ejemplo 12 o 12,5." })
        .int({ error: "Rendimiento: usa hasta dos decimales." })
        .positive({ error: "Rendimiento: debe ser mayor a cero." })
        .max(MAX_YIELD_BPS, { error: `Rendimiento: no puede superar ${formatYield(MAX_YIELD_BPS)}.` }),
    ),
    validUntil: z.iso.date({ error: "Ingresa una fecha de vigencia válida." }).refine((d) => d >= today, {
      error: "La vigencia no puede ser anterior a hoy.",
    }),
    notes: z.string({ error: "Las notas deben ser texto." }).trim().max(500, { error: "Máximo 500 caracteres." }).default(""),
  });

export interface ProposalTermsInput {
  amount: number;
  yieldBps: number;
  validUntil: string;
  notes: string;
}

// The form speaks `yieldPercent`; the domain speaks basis points.
const toInput = (v: { amount: number; yieldPercent: number; validUntil: string; notes: string }): ProposalTermsInput => ({
  amount: v.amount,
  yieldBps: v.yieldPercent,
  validUntil: v.validUntil,
  notes: v.notes,
});

// The investor's opening proposal.
export const buildProposalTermsSchema = (context: Context) => termsShape(context).transform(toInput);

// A counter has the same terms, and must differ from the latest revision in amount or yield.
export const buildCounterSchema = (context: Context & { latest: Pick<ProposalRevision, "amount" | "yieldBps"> }) =>
  termsShape(context)
    .superRefine((value, ctx) => {
      if (!counterChangesATerm(context.latest, { amount: value.amount, yieldBps: value.yieldPercent })) {
        ctx.addIssue({ code: "custom", path: [], message: NO_CHANGE_MESSAGE });
      }
    })
    .transform(toInput);

export const revisionSchema = z.preprocess(
  digitsToNumber,
  z.number({ error: "Revisión inválida." }).int({ error: "Revisión inválida." }).positive({ error: "Revisión inválida." }),
);
