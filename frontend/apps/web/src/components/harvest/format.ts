import { formatDateTime as presaleDateTime, formatDay } from "~/components/presale/format";

// Same es-CO formatters as the rest of the app (one date format everywhere).
export const formatDate = (iso: string): string => formatDay(iso);

export const formatDateTime = (iso: string): string => presaleDateTime(iso);

// "ord-1001" -> "1001": the friendly code shown to people (URLs keep the id).
export const orderCode = (id: string): string => id.replace(/^ord-/i, "");

// 200 bp -> "2 %", 250 bp -> "2,5 %" (integer arithmetic on the digits, no float division).
export function formatBp(bp: number): string {
  const whole = Math.floor(bp / 100);
  const fraction = bp % 100;
  return fraction === 0 ? `${whole} %` : `${whole},${String(fraction).padStart(2, "0").replace(/0$/, "")} %`;
}

export const linkClass = "inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4";
