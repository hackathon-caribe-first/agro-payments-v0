import { z } from "zod";
import { PROJECT_STATUSES } from "../domain/project";

// RF-01: GeoJSON Polygon, [longitude, latitude] positions.
export const plotPolygonDtoSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

// Transport shape (snake_case, PRD projects table). Validated at the boundary, then mapped to domain types.
export const projectDtoSchema = z.object({
  id: z.string(),
  project_code: z.string(),
  title: z.string(),
  production_type: z.string(),
  description: z.string(),
  target_amount: z.number().nonnegative(),
  custody_balance: z.number().nonnegative(),
  total_disbursed: z.number().nonnegative(),
  investor_roi_pct: z.number(),
  platform_fee_pct: z.number(),
  current_status: z.enum(PROJECT_STATUSES),
  start_date: z.string(),
  estimated_end_date: z.string(),
  currency: z.string(),
  plot_polygon: plotPolygonDtoSchema.optional(),
  producer_wallet_address: z.string().optional(),
  // Mock only: our backend neither stores nor returns it.
  contingency_bps: z.number().int().nonnegative().nullable().optional(),
});

export type ProjectDto = z.infer<typeof projectDtoSchema>;

// POST /projects body: the project plus its ordered milestones (position defines sequence_order).
export const createProjectRequestDtoSchema = z.object({
  title: z.string(),
  description: z.string(),
  production_type: z.string(),
  start_date: z.string(),
  estimated_end_date: z.string(),
  // Mock only: our backend ignores it.
  contingency_bps: z.number().int().nonnegative().optional(),
  milestones: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      estimated_completion_date: z.string(),
      supplies_budget: z.number().int().nonnegative(),
      labor_budget: z.number().int().nonnegative(),
      sequence_order: z.number().int().positive(),
      requirements_schema: z.object({ required_evidences: z.array(z.never()) }),
    }),
  ),
  plot_polygon: plotPolygonDtoSchema.optional(),
  producer_wallet_address: z.string().optional(),
});

export type CreateProjectRequestDto = z.infer<typeof createProjectRequestDtoSchema>;

// Body of a 400 response: a message plus field errors keyed by position (e.g. "milestones.2.laborBudget").
export const rejectionBodySchema = z.object({
  error: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).default({}),
});

export type RejectionBody = z.infer<typeof rejectionBodySchema>;
