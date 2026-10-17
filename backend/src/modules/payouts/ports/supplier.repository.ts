import type { Supplier } from "../application/supplier";

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class SupplierRepository {
  abstract save(supplier: Supplier): Promise<void>;
  /** Oldest first. */
  abstract findAll(): Promise<Supplier[]>;
  abstract findById(id: string): Promise<Supplier | null>;
  /** Case-insensitive, trimmed: the name the producer dictates to the assistant. */
  abstract findByName(name: string): Promise<Supplier | null>;
}
