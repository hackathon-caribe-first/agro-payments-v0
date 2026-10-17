import { test, expect } from "@playwright/test";
import { asRole } from "../fixtures/actors";
import { scene } from "../fixtures/steps";
test("Inversor: aprobar grant pendiente de cacao", async ({ page }) => {
  await asRole(page, "Inversor");
  await page.goto("/investor/grants");
  const card = page.locator("li").filter({ hasText: "Cacao" }).filter({ has: page.getByRole("link", { name: "Revisar y aprobar" }) }).first();
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Revisar y aprobar" }).click();
  await scene(page, "1 · Inversor revisa tope y alcance del grant");
  await page.getByRole("checkbox", { name: /Estoy usando la cuenta dueña/ }).check();
  await page.getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect(page.getByText("Aprobación verificada.")).toBeVisible();
  await scene(page, "2 · Grant aprobado por la billetera simulada");
});

test("Inversor: rechazar grant pendiente", async ({ page }) => {
  await asRole(page, "Inversor");
  await page.goto("/investor/grants");
  const card = page.locator("li").filter({ hasText: "Cacao" }).filter({ has: page.getByRole("link", { name: "Revisar y aprobar" }) }).first();
  await card.getByRole("link", { name: "Revisar y aprobar" }).click();
  await scene(page, "1 · Consentimiento de pago solicitado");
  await page.getByRole("button", { name: "Rechazar", exact: true }).click();
  await expect(page.getByText("Rechazado", { exact: true })).toBeVisible();
  await scene(page, "2 · Grant rechazado, sin autorización de pagos");
});

test("Inversor: revocar un grant activo", async ({ page }) => {
  await asRole(page, "Inversor");
  await page.goto("/investor/grants");
  const grant = page.locator("li").filter({ hasText: "Plátano" }).filter({ has: page.getByRole("link", { name: "Ver detalle" }) }).first();
  await expect(grant).toBeVisible();
  await grant.getByRole("link", { name: "Ver detalle" }).click();
  await scene(page, "1 · Grant activo, tope y consumo");
  await page.getByRole("button", { name: "Revocar grant" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revocar grant" }).click();
  await expect(page.getByText(/Grant revocado\. Los tokens/)).toBeVisible();
  await scene(page, "2 · Grant revocado y saldo sin gastar preservado");
});
