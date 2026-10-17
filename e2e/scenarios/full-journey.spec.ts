import { test, expect } from "@playwright/test";
import { asRole } from "../fixtures/actors";
import { decide, openReview, scene } from "../fixtures/steps";

test("Demo orquestada: corrección, aprobación, pago y conciliación (SIMULADOS)", async ({ page }) => {
  await asRole(page, "Productor");
  await page.goto("/producer/milestones/ms-02");
  await scene(page, "PRODUCTOR · Corrige evidencia de siembra");
  await page.locator('input[name="seedlings_planted"]').fill("1500");
  await page.locator('input[name="spacing_cm"]').fill("150");
  await page.locator('input[name="field_photos"]').nth(0).check();
  await page.locator('input[name="field_photos"]').nth(1).check();
  await page.getByRole("button", { name: "Guardar registro" }).click();
  await expect(page.getByText("Registro guardado.")).toBeVisible();
  await page.getByRole("button", { name: "Enviar a revisión" }).click();
  await expect(page.getByText("En revisión técnica", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await asRole(page, "Verificador");
  await openReview(page, "Siembra de plántulas");
  await scene(page, "VERIFICADOR · Evidencia corregida, lista para decidir");
  await decide(page, "Aprobado");
  await scene(page, "PAGOS · Dictamen favorable, desembolso pendiente");
  await page.getByRole("button", { name: "Confirmar pago al productor" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar pago", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pago al productor confirmado" })).toBeVisible();
  await scene(page, "PAGOS · Comprobante emitido (simulación)");

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await asRole(page, "Operador");
  await page.getByRole("link", { name: "Conciliación", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Conciliación" })).toBeVisible();
  await scene(page, "OPERADOR · Conciliación de comprobantes simulados");
});
