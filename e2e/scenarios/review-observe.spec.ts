import { test, expect } from "@playwright/test";
import { asRole } from "../fixtures/actors";
import { decide, openReview, scene } from "../fixtures/steps";
test("Verificador: observar hito y bloquear desembolso", async ({ page }) => {
  await asRole(page, "Verificador");
  await openReview(page, "Preparación del terreno");
  await scene(page, "1 · Evidencia recibida por el verificador");
  await decide(page, "Observado");
  await expect(page.getByText("Requiere correcciones", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar pago al productor" })).toHaveCount(0);
  await scene(page, "2 · Observación registrada: sin pago al productor");
});
