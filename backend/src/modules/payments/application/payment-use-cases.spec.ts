import { InMemoryPaymentAdapter } from "../infrastructure/adapters/in-memory-payment.adapter";
import { CreatePaymentUseCase } from "./create-payment.use-case";
import { GetPaymentUseCase } from "./get-payment.use-case";

describe("payments use cases", () => {
  const repository = new InMemoryPaymentAdapter();
  const createPayment = new CreatePaymentUseCase(repository);
  const getPayment = new GetPaymentUseCase(repository);

  it("creates a payment that can be retrieved by id", async () => {
    const created = await createPayment.execute({ amount: 1500, currency: "COP" });

    expect(await getPayment.execute(created.id)).toEqual(created);
  });

  it("fails when the payment does not exist", async () => {
    await expect(getPayment.execute("missing")).rejects.toThrow("Payment missing not found");
  });
});
