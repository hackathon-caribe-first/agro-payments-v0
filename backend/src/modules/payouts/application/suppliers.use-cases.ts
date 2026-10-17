import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { DomainError, ValidationError } from "../../../shared/domain-errors";
import { SupplierRepository } from "../ports/supplier.repository";
import { WalletDirectory } from "../ports/wallet-directory";
import { parseSupplierRequest, SUPPLIER_ASSET, type Supplier } from "./supplier";

@Injectable()
export class SuppliersUseCases {
  constructor(
    private readonly suppliers: SupplierRepository,
    private readonly wallets: WalletDirectory,
  ) {}

  /** RF-15: validates the wallet with a GET (it exists and receives COP) before storing the supplier. */
  async register(body: unknown): Promise<Supplier> {
    const input = parseSupplierRequest(body);
    if (await this.suppliers.findByName(input.name)) throw new DomainError(`Supplier ${input.name} is already registered`);
    const wallet = await this.wallets.lookup(input.walletAddress);
    if (!wallet) throw new ValidationError({ wallet_address: ["No encontramos esa billetera. Revisa la dirección."] }, "Wallet address not found");
    if (wallet.assetCode !== SUPPLIER_ASSET) {
      throw new ValidationError({ wallet_address: [`La billetera debe recibir pesos colombianos (COP); esta recibe ${wallet.assetCode}.`] }, "Wallet is not in COP");
    }
    const supplier: Supplier = {
      id: randomUUID(),
      name: input.name,
      walletAddress: wallet.id,
      assetCode: wallet.assetCode,
      assetScale: wallet.assetScale,
      createdAt: new Date(),
    };
    await this.suppliers.save(supplier);
    return supplier;
  }

  list(): Promise<Supplier[]> {
    return this.suppliers.findAll();
  }
}
