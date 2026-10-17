import { test, expect } from "@playwright/test";
import { asRole } from "../fixtures/actors";
import { scene } from "../fixtures/steps";

test("Productor: registrar evidencia y solicitar nueva revisión", async ({ page }) => {
  await asRole(page, "Productor");
  await page.goto("/producer/milestones/ms-02");
  await scene(page, "1 · Productor corrige hito observado");
  await expect(page.getByRole("heading", { name: "Registrar evidencia" })).toBeVisible();
  await page.locator('input[name="seedlings_planted"]').fill("1500");
  await page.locator('input[name="spacing_cm"]').fill("150");
  const photos = page.locator('input[name="field_photos"]');
  await photos.nth(0).check();
  await photos.nth(1).check();
  await page.getByRole("button", { name: "Guardar registro" }).click();
  await expect(page.getByText("Registro guardado.")).toBeVisible();
  await scene(page, "2 · Evidencia guardada");
  const send = page.getByRole("button", { name: "Enviar a revisión" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText("En revisión técnica", { exact: true })).toBeVisible();
  await scene(page, "3 · Hito reenviado al verificador");
});

test("Operador: ver panel de conciliación y recibos simulados", async ({ page }) => {
  await asRole(page, "Operador");
  await page.goto("/ops/reconciliation");
  await scene(page, "Operador · Conciliación de pagos por beneficiario");
  await expect(page.getByRole("heading", { name: "Conciliación" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pagos por beneficiario" })).toBeVisible();
});
