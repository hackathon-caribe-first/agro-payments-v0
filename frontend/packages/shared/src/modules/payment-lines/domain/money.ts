// Money helpers for the split. Amounts are ALWAYS integers in minimal units (RNF-10): no floats anywhere.

export const BPS_DENOMINATOR = 10000;

// floor(a * b / d) using only integer operations on safe integers.
export function mulDivFloor(a: number, b: number, d: number): number {
  const product = a * b;
  return (product - (product % d)) / d;
}

// "1.234,50" or "1234,5" -> minimal units for the given scale. Null when the text is not a valid amount for that scale.
export function parseMinorUnits(input: string, scale: number): number | null {
  const text = input.trim().replace(/\s/g, "");
  if (text === "") return null;
  const [whole, fraction = "", ...rest] = text.split(",");
  if (rest.length > 0) return null;
  const digits = whole.replace(/\./g, "");
  if (!/^\d+$/.test(digits) || !/^\d*$/.test(fraction) || fraction.length > scale) return null;
  const value = Number(`${digits}${fraction.padEnd(scale, "0")}`);
  return Number.isSafeInteger(value) ? value : null;
}

// "12" or "12,5" percent -> basis points (1250). At most two decimals.
export function parsePercentBps(input: string): number | null {
  const text = input.trim().replace(/\s/g, "").replace(/%$/, "");
  if (text === "") return null;
  const [whole, fraction = "", ...rest] = text.split(",");
  if (rest.length > 0 || !/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > 2) return null;
  return Number(`${whole}${fraction.padEnd(2, "0")}`);
}

export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  return fraction === 0 ? `${whole} %` : `${whole},${String(fraction).padStart(2, "0").replace(/0$/, "")} %`;
}

// Fixed decimals (unlike the shared formatMoney, which hides a zero fraction): "EUR 950,00". Scale 0 prints no decimals.
export function formatAmount(amount: number, currency: string, scale: number): string {
  const negative = amount < 0;
  const digits = String(Math.abs(Math.round(amount))).padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  const grouped = new Intl.NumberFormat("es-CO").format(BigInt(whole));
  return `${currency} ${negative ? "-" : ""}${scale > 0 ? `${grouped},${fraction}` : grouped}`;
}

// The text to prefill an amount input with (no currency, no grouping).
export function toInputText(amount: number, scale: number): string {
  if (scale === 0) return String(amount);
  const digits = String(amount).padStart(scale + 1, "0");
  return `${digits.slice(0, digits.length - scale)},${digits.slice(digits.length - scale)}`;
}
