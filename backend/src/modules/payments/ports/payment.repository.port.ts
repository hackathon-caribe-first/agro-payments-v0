export type Payment = {
  id: string;
  amount: number;
  currency: string;
  createdAt: Date;
};

// Abstract class (not interface) so it doubles as the Nest DI token.
export abstract class PaymentRepositoryPort {
  abstract save(payment: Payment): Promise<void>;
  abstract findById(id: string): Promise<Payment | null>;
}
