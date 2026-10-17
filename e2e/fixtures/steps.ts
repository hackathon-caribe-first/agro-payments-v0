import { expect, type Page } from "@playwright/test";

export async function scene(page: Page, label: string) {
  await page.evaluate((title) => {
    const previous = document.getElementById("surco-demo-caption");
    previous?.remove();
    const caption = document.createElement("div");
    caption.id = "surco-demo-caption";
    caption.textContent = title;
    Object.assign(caption.style, {
      position: "fixed", zIndex: "2147483647", bottom: "20px", left: "20px",
      padding: "12px 20px", borderRadius: "12px", background: "#12271a",
      color: "white", font: "bold 18px sans-serif", boxShadow: "0 3px 20px #0007",
      pointerEvents: "none", maxWidth: "70vw",
    });
    document.body.append(caption);
  }, label);
  if (process.env.DEMO_MODE === "1") await page.waitForTimeout(Number(process.env.DEMO_PAUSE_MS ?? 1300));
}
export async function expectMilestone(page: Page, status: string) {
  await expect(page.locator("header").getByText(status, { exact: true })).toBeVisible();
}
export async function openReview(page: Page, title: string) {
  await page.goto("/verifier/reviews");
  const card = page.locator("li").filter({ hasText: title }).filter({ has: page.getByRole("link", { name: "Revisar y dictaminar" }) }).first();
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Revisar y dictaminar" }).click();
}
export async function decide(page: Page, verdict: "Aprobado" | "Observado") {
  await expect(page.getByRole("heading", { name: "Dictamen técnico" })).toBeVisible();
  await page.getByRole("radio", { name: verdict }).check();
  await page.getByLabel("Comentarios del dictamen").fill(verdict === "Aprobado"
    ? "Evidencia validada y criterios técnicos conformes."
    : "Es necesario corregir la evidencia técnica del lote.");
  if (verdict === "Observado") {
    await page.getByLabel("Subsanación 1").fill("Adjuntar evidencia adicional del lote y validar las mediciones.");
  } else {
    const criteria = page.locator('input[id^="criterion-"][id$="-passed"]');
    for (let i = 0; i < await criteria.count(); i++) {
      if (!(await criteria.nth(i).isChecked())) await criteria.nth(i).check();
    }
  }
  await page.getByRole("button", { name: "Firmar y emitir dictamen", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Firmar y emitir" }).click();
  await expect(page.locator("header").getByText(verdict === "Aprobado" ? "Pago de mano de obra pendiente" : "Requiere correcciones", { exact: true })).toBeVisible();
}
