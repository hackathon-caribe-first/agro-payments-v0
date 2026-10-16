import { Money } from "./money";

test("creates money from a non-negative amount and currency", () => {
  expect(Money.create(1500, "COP")).toEqual({ amount: 1500, currency: "COP" });
});

test("rejects negative amounts", () => {
  expect(() => Money.create(-1, "COP")).toThrow();
});

test("adds money of the same currency", () => {
  expect(Money.add(Money.create(100, "COP"), Money.create(50, "COP"))).toEqual({ amount: 150, currency: "COP" });
});

test("refuses to add different currencies", () => {
  expect(() => Money.add(Money.create(1, "COP"), Money.create(1, "USD"))).toThrow();
});
