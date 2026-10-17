// Pure integer-math liquidation (RF-16, "Split de liquidación", D-04). No floating point survives a division:
// every percentage goes through Math.floor on integer products, and the producer line is the REMAINDER.

export const DEFAULT_PLATFORM_FEE_BP = 200; // platform_fee_pct 2.00 % expressed in basis points

export interface LiquidationInput {
  total: number;
  platformFeeBp: number;
  capitalDue: number;
  yieldDue: number;
}

export interface Liquidation {
  platformFee: number;
  investorCapital: number;
  investorYield: number;
  producerNet: number;
  // capital + yield the sale could not cover (the investor absorbs it, D-04).
  shortfall: number;
  loss: boolean;
}

// floor(amount * bp / 10000) with integers only.
export function percentOfBp(amount: number, bp: number): number {
  return Math.floor((amount * bp) / 10000);
}

// Yield agreed as a whole percentage of the capital (investor_roi_pct).
export function yieldFor(capital: number, yieldPct: number): number {
  return Math.floor((capital * yieldPct) / 100);
}

// Strict order: platform commission -> investor capital -> investor agreed yield -> producer net profit (remainder).
export function computeLiquidation({ total, platformFeeBp, capitalDue, yieldDue }: LiquidationInput): Liquidation {
  const platformFee = Math.min(total, percentOfBp(total, platformFeeBp));
  let remaining = total - platformFee;
  const investorCapital = Math.min(capitalDue, remaining);
  remaining -= investorCapital;
  const investorYield = Math.min(yieldDue, remaining);
  remaining -= investorYield;
  // Whatever is left (including rounding cents) goes to the producer; it is 0 when the sale does not cover the investor.
  const producerNet = remaining;
  const shortfall = capitalDue - investorCapital + (yieldDue - investorYield);
  return { platformFee, investorCapital, investorYield, producerNet, shortfall, loss: shortfall > 0 };
}

export function liquidationSum(l: Liquidation): number {
  return l.platformFee + l.investorCapital + l.investorYield + l.producerNet;
}

// Invariant: the lines add up to the order total, to the unit.
export function liquidationBalances(l: Liquidation, total: number): boolean {
  return liquidationSum(l) === total;
}
