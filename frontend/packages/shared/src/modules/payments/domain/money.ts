import { z } from "zod";

const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
});

export type Money = Readonly<z.infer<typeof MoneySchema>>;

export const Money = {
  create: (amount: number, currency: string): Money => MoneySchema.parse({ amount, currency }),
  add: (a: Money, b: Money): Money => {
    if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
    return Money.create(a.amount + b.amount, a.currency);
  },
};
