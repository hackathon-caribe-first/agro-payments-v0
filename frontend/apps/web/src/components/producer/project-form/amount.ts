// Budget inputs hold digit strings; empty or invalid input has no amount (null), never NaN.
export function parseAmount(digits: string): number | null {
  if (digits.trim() === "") return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}
