import { z } from "zod";

// Transport shapes (snake_case) of the harvest (RF-24), custody (RF-21) and investor panel (RF-27) routes.
// Statuses stay free strings so values added by a newer server pass the boundary. COP amounts are whole pesos;
// foreign-wallet amounts are minor-unit strings with their asset.
const foreignDtoSchema = z.object({ value: z.string(), asset_code: z.string(), asset_scale: z.number().int() });

export const harvestEnvelopeDtoSchema = z.object({
  project_id: z.string(),
  project_code: z.string(),
  project_title: z.string(),
  project_status: z.string(),
  harvest: z
    .object({
      status: z.string(),
      declared_quantity_kg: z.number(),
      declared_quality: z.string(),
      evidence: z.string(),
      declared_at: z.string(),
      certified_quantity_kg: z.number().nullable(),
      certified_quality: z.string().nullable(),
      certification_notes: z.string().nullable(),
      certified_at: z.string().nullable(),
      price: z.object({ source: z.string(), price_per_kg: z.number(), exchange_factor: z.string() }).nullable(),
      amount_due: z.number().nullable(),
      currency: z.string(),
      buyer_id: z.string().nullable(),
      payment_reference: z.string().nullable(),
      paid_at: z.string().nullable(),
      received_at: z.string().nullable(),
    })
    .nullable(),
  payment_redirect_url: z.string().nullable(),
});

export const custodyDtoSchema = z.object({
  project_id: z.string(),
  currency: z.string(),
  balance: z.number(),
  // RF-21: true when more left custody than reached it (balance < 0); older servers omit it.
  overdrawn: z.boolean().optional(),
  credited: z.number(),
  credits: z.array(z.object({ category: z.string(), amount: z.number() })),
  // Ledger DEBITs (the insurance premium), already out of custody_balance; `credited` adds them back.
  debits: z.array(z.object({ category: z.string(), amount: z.number() })),
  debited: z.number(),
  ledger_debits: z.number(),
  milestone_debits: z.number(),
  settlement_debits: z.number(),
});

const payoutDtoSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.number(),
  wallet_currency: z.string(),
  reference: z.string().nullable(),
  settled_at: z.string().nullable(),
  receipt: z.object({ debit_amount: foreignDtoSchema.nullable(), receive_amount: foreignDtoSchema.nullable(), rate: z.string().nullable() }).nullable(),
});

export const panelDtoSchema = z.object({
  project: z.object({ id: z.string(), project_code: z.string(), title: z.string(), current_status: z.string(), currency: z.string() }),
  capture: z.object({
    target_amount: z.number(),
    raised: z.number(),
    progress_pct: z.number(),
    investors_count: z.number().int(),
    by_currency: z.array(z.object({ currency: z.string(), debited: z.string(), received_cop: z.number() })),
  }),
  custody: custodyDtoSchema,
  milestones: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      sequence_order: z.number().int().nullable(),
      status: z.string(),
      grant: z.object({ status: z.string(), cap: z.number(), spent: z.number(), remaining: z.number() }),
      lines: z.array(
        z.object({
          id: z.string(),
          kind: z.string(),
          beneficiary: z.string(),
          amount: z.number(),
          status: z.string(),
          reference: z.string().nullable(),
          settled_at: z.string().nullable(),
          receipt: z
            .object({ debit_amount: foreignDtoSchema.nullable(), receive_amount: foreignDtoSchema.nullable(), rate: z.string().nullable(), outgoing_payment_id: z.string().nullable() })
            .nullable(),
        }),
      ),
    }),
  ),
  my_investments: z.array(
    z.object({
      id: z.string(),
      investor_id: z.string(),
      status: z.string(),
      amount: z.number(),
      currency: z.string(),
      debit: foreignDtoSchema.nullable(),
      receive_amount: z.number().nullable(),
      implied_rate: z.string().nullable(),
      outgoing_payment_id: z.string().nullable(),
      captured_at: z.string().nullable(),
      payouts: z.array(payoutDtoSchema),
    }),
  ),
  realized: z.object({
    status: z.string(),
    settlement_id: z.string().optional(),
    days: z.number().optional(),
    capital: z.number().optional(),
    returned: z.number().optional(),
    tir_cop_pct: z.number().nullable().optional(),
    investor_currency: z.string().optional(),
    tir_investor_currency_pct: z.number().nullable().optional(),
    exit_rate_assumed: z.boolean().optional(),
  }),
  median: z
    .object({
      run_id: z.string(),
      created_at: z.string(),
      tir_cop_pct: z.number(),
      investor_currency: z.string(),
      entry_rate: z.number().nullable(),
      exit_rate: z.number().nullable(),
      tir_investor_currency_pct: z.number().nullable(),
    })
    .nullable(),
});

export type HarvestEnvelopeDto = z.infer<typeof harvestEnvelopeDtoSchema>;
export type CustodyDto = z.infer<typeof custodyDtoSchema>;
export type PanelDto = z.infer<typeof panelDtoSchema>;
