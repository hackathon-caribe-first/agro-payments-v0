import { expect, type Page } from "@playwright/test";

export type Actor = "Productor" | "Verificador" | "Inversor" | "Operador" | "Comprador";
export async function asRole(page: Page, actor: Actor) {
  await page.goto("/login");
  // The mock identity directory offers role-labeled profile cards.
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  const profiles = page.getByRole("group", { name: "Selecciona tu perfil para entrar" });
  const card = profiles.locator("label").filter({ hasText: actor }).first();
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}
