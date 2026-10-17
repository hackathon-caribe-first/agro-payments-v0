// RF-04: the purchase contract a buyer agrees before the project is published (Fase 0 paso 4). Pure types: the wire
// parser validates the fields, the use case checks the buyer and their wallet.

import { PROJECT_STATUS, type ProjectStatus } from "../../projects/application/project";

export const PRICE_TYPE = { FIXED: "fixed", FORMULA: "formula" } as const;
export type PriceType = (typeof PRICE_TYPE)[keyof typeof PRICE_TYPE];

export const CONTRACT_UNITS = ["kg", "t"] as const;
export type ContractUnit = (typeof CONTRACT_UNITS)[number];

/** COP settles today; USD (RF-32, «Siguiente») is accepted and stored, but nothing settles it yet. */
export const CONTRACT_CURRENCIES = ["COP", "USD"] as const;
export type ContractCurrency = (typeof CONTRACT_CURRENCIES)[number];

/** Prices in minor units (scale 2) of the contract currency, per unit. A5: P_g = max(floor, min(ceiling, f(reference))). */
export type PurchasePrice =
  | { type: typeof PRICE_TYPE.FIXED; pricePerUnit: number }
  | { type: typeof PRICE_TYPE.FORMULA; floorPerUnit: number; ceilingPerUnit: number; reference: string };

export interface PurchaseContract {
  projectId: string;
  price: PurchasePrice;
  quantity: number;
  unit: ContractUnit;
  currency: ContractCurrency;
  buyerUserId: string;
  /** Validated with a GET in open-payments mode (exists; its asset is recorded). */
  buyerWalletAddress: string;
  buyerWalletAssetCode: string;
  buyerWalletAssetScale: number;
  updatedBy: string;
  updatedAt: Date;
}

/** «Antes de publicar»: once the capture opens, the terms the offer rule priced are fixed. */
export const PURCHASE_CONTRACT_EDITABLE: readonly ProjectStatus[] = [PROJECT_STATUS.DRAFT, PROJECT_STATUS.CONTRACT_SIGNED];

const money = (minor: number, currency: string) => `${currency === "COP" ? "$" : "US$"} ${(minor / 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}`;

export function describePrice(c: Pick<PurchaseContract, "price" | "unit" | "currency">): string {
  if (c.price.type === PRICE_TYPE.FIXED) return `Precio fijo: ${money(c.price.pricePerUnit, c.currency)} por ${c.unit}`;
  return `Precio por fórmula sobre ${c.price.reference}: piso ${money(c.price.floorPerUnit, c.currency)} y techo ${money(c.price.ceilingPerUnit, c.currency)} por ${c.unit}`;
}

export { money as formatMoney };
