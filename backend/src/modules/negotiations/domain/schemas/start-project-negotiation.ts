import { z } from "zod";
import { UNITS, type OfferTerms } from "../presale";
import { counterChangesATerm } from "../negotiation-rules";
import { isoDate, positiveInt } from "./fields";

export const NO_CHANGE_MESSAGE = "La contraoferta debe cambiar al menos una condición.";

// The terms of a PROJECT offer: registered only, they never change the deposit. No availability cap, no unit-match rule.
export const buildProjectTermsSchema = (today: string) =>
  z.object({
    quantity: positiveInt("Cantidad"),
    unit: z.enum(UNITS, { error: "Selecciona la unidad." }),
    unitPrice: positiveInt("Precio unitario"),
    deliveryDate: isoDate("Ingresa una fecha de entrega válida.").refine((d) => d >= today, {
      error: "La fecha de entrega no puede ser anterior a hoy.",
    }),
    validUntil: isoDate("Ingresa una fecha de vigencia válida.").refine((d) => d > today, {
      error: "La vigencia debe ser posterior a hoy.",
    }),
    notes: z.string({ error: "Las notas deben ser texto." }).trim().max(500, { error: "Máximo 500 caracteres." }).default(""),
  });

// The buyer's opening offer on a project.
export const buildStartProjectNegotiationSchema = buildProjectTermsSchema;

export type ProjectTermsInput = z.output<ReturnType<typeof buildProjectTermsSchema>>;

type ProjectTerms = Extract<OfferTerms, { kind: "PROJECT" }>;

// A counter has the same terms as an opening offer, and must differ from the latest offer in at least one of them.
export const buildProjectCounterSchema = ({ today, latest }: { today: string; latest: ProjectTerms }) =>
  buildProjectTermsSchema(today).superRefine((value, ctx) => {
    const next: ProjectTerms = { kind: "PROJECT", ...value, rawUnit: value.unit };
    if (!counterChangesATerm(latest, next)) ctx.addIssue({ code: "custom", path: [], message: NO_CHANGE_MESSAGE });
  });
