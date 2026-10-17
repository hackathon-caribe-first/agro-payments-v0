import { test, expect } from "@playwright/test";
import { asRole } from "../fixtures/actors";
import { decide, openReview, scene } from "../fixtures/steps";
test("Verificador: aprobar hito y confirmar pago de mano de obra (simulado)", async ({ page }) => {
  await asRole(page, "Verificador");
  await openReview(page, "Preparación del terreno");
  await scene(page, "1 · Verificador inspecciona la evidencia");
  await decide(page, "Aprobado");
  await scene(page, "2 · Dictamen firmado y pago pendiente");
  await expect(page.getByRole("button", { name: "Confirmar pago al productor" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar pago al productor" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar pago", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pago al productor confirmado" })).toBeVisible();
  await expect(page.getByText("Comprobante", { exact: true })).toBeVisible();
  await scene(page, "3 · Pago simulado confirmado con comprobante");
});
