import { expect, type Page } from "@playwright/test";

export type Actor = "Productor" | "Verificador" | "Inversor" | "Operador" | "Comprador";

export async function asRole(page: Page, actor: Actor) {
  // Crucial for the integrated demo: a hard reload reinitializes the in-memory mock stores.
  // Logout already navigates to /login through React Router, so do not reload it.
  if (new URL(page.url()).pathname !== "/login") await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  const profiles = page.getByRole("group", { name: "Selecciona tu perfil para entrar" });
  const card = profiles.locator("label").filter({ hasText: actor }).first();
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}
