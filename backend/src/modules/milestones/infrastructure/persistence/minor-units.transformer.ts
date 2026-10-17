import type { ValueTransformer } from "typeorm";

// pg returns bigint as a string; the domain uses safe integers, so anything larger is a corrupt row, not a rounding.
export const minorUnits: ValueTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => {
    if (value === null) return null;
    const n = Number(value);
    if (!Number.isSafeInteger(n)) throw new Error(`Stored amount ${value} is not a safe integer`);
    return n;
  },
};
