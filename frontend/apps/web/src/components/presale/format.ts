import type { ListingUnit, Unit } from "@agro/shared/modules/presales/domain/presale";

const UNIT_LABELS: Record<Unit, { singular: string; plural: string }> = {
  KG: { singular: "kg", plural: "kg" },
  TON: { singular: "tonelada", plural: "toneladas" },
  BULTO: { singular: "bulto", plural: "bultos" },
};

// Anything that carries a unit ({unit, rawUnit}).
export interface UnitRef {
  unit: ListingUnit;
  rawUnit: string;
}

const numberFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });

// Unknown units show the raw string received instead of a guess.
export const unitText = (ref: UnitRef, quantity = 2): string =>
  ref.unit === "UNKNOWN" ? ref.rawUnit : quantity === 1 ? UNIT_LABELS[ref.unit].singular : UNIT_LABELS[ref.unit].plural;

export const formatQuantity = (quantity: number, ref: UnitRef | null): string =>
  ref ? `${numberFormat.format(quantity)} ${unitText(ref, quantity)}` : numberFormat.format(quantity);

// ISO yyyy-mm-dd dates are calendar days: format them in UTC so the day never shifts with the local zone.
export const formatDay = (iso: string): string => dateFormat.format(new Date(iso));

export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));
