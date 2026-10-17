import type { DataSource } from "typeorm";
import type { Supplier } from "../application/supplier";
import { SupplierRepository } from "../ports/supplier.repository";

// Plain SQL over the TypeORM connection (table from migration PayoutsSuppliersAndLiquidationGrants1792454400000), like the assistant store.
type Row = Record<string, unknown>;
const toSupplier = (r: Row): Supplier => ({
  id: r.id as string,
  name: r.name as string,
  walletAddress: r.wallet_address as string,
  assetCode: r.asset_code as string,
  assetScale: r.asset_scale as number,
  createdAt: r.created_at as Date,
});

export class PostgresSupplierRepository extends SupplierRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async save(s: Supplier) {
    await this.dataSource.query(
      `INSERT INTO suppliers (id, name, wallet_address, asset_code, asset_scale, created_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, wallet_address = EXCLUDED.wallet_address, asset_code = EXCLUDED.asset_code, asset_scale = EXCLUDED.asset_scale`,
      [s.id, s.name, s.walletAddress, s.assetCode, s.assetScale, s.createdAt],
    );
  }

  async findAll() {
    const rows: Row[] = await this.dataSource.query("SELECT * FROM suppliers ORDER BY created_at, id");
    return rows.map(toSupplier);
  }

  async findById(id: string) {
    const [row] = await this.dataSource.query("SELECT * FROM suppliers WHERE id = $1", [id]);
    return row ? toSupplier(row) : null;
  }

  async findByName(name: string) {
    const [row] = await this.dataSource.query("SELECT * FROM suppliers WHERE lower(name) = lower($1)", [name.trim()]);
    return row ? toSupplier(row) : null;
  }
}
