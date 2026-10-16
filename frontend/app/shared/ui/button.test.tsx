import { render, screen } from "@testing-library/react";
import { Button } from "./button";

test("renders an accessible button that forwards clicks", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Pagar</Button>);
  screen.getByRole("button", { name: "Pagar" }).click();
  expect(onClick).toHaveBeenCalledOnce();
});
