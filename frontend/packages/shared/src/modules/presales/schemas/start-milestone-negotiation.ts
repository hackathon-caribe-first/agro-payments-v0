import { z } from "zod";
import type { OfferTerms } from "../domain/presale";
import { counterChangesATerm } from "../domain/negotiation-rules";
import { isoDate, positiveInt } from "./fields";
import { NO_CHANGE_MESSAGE } from "./start-project-negotiation";

// The terms of a MILESTONE offer: a lump-sum price and a date. There is no validity: milestone offers never expire.
// The opening offer may equal the milestone's reference budget.
export const buildMilestoneTermsSchema = (today: string) =>
  z.object({
    price: positiveInt("Precio del hito"),
    deliveryDate: isoDate("Ingresa una fecha de entrega válida.").refine((d) => d >= today, {
      error: "La fecha de entrega no puede ser anterior a hoy.",
    }),
    notes: z.string({ error: "Las notas deben ser texto." }).trim().max(500, { error: "Máximo 500 caracteres." }).default(""),
  });

export const buildStartMilestoneNegotiationSchema = buildMilestoneTermsSchema;

export type MilestoneTermsInput = z.output<ReturnType<typeof buildMilestoneTermsSchema>>;

type MilestoneTerms = Extract<OfferTerms, { kind: "MILESTONE" }>;

export const buildMilestoneCounterSchema = ({ today, latest }: { today: string; latest: MilestoneTerms }) =>
  buildMilestoneTermsSchema(today).superRefine((value, ctx) => {
    const next: MilestoneTerms = { kind: "MILESTONE", ...value };
    if (!counterChangesATerm(latest, next)) ctx.addIssue({ code: "custom", path: [], message: NO_CHANGE_MESSAGE });
  });
