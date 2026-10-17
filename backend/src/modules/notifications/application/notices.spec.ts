import { noticesFor, plainReason } from "./notices";

const project = { id: "p-1", title: "Tomate P2", ownerUserId: "u-prod" };
const ms = { projectId: "p-1", milestoneId: "p-1-ms-2", milestoneTitle: "Fertilización" };

describe("plainReason (RF-37: the verifier's reason in simple words, no LLM)", () => {
  it("trims, collapses spaces, drops the final period and swaps technical words", () => {
    expect(plainReason("  La foto  georreferenciada es ilegible y no coincide con el polígono. ")).toBe("la foto con la ubicación no se ve bien y no coincide con el lote");
  });
  it("caps very long reasons", () => {
    expect(plainReason("x".repeat(600)).length).toBeLessThanOrEqual(281);
  });
  it("has a fallback for an empty reason", () => {
    expect(plainReason(null)).toBe("el verificador pidió revisar la evidencia");
  });
});

describe("noticesFor (RF-37)", () => {
  it("tells the producer the project is active", () => {
    expect(noticesFor({ type: "project.funded", projectId: "p-1" }, project)).toEqual([
      {
        recipient: { userId: "u-prod" },
        kind: "project_activated",
        title: "Proyecto activado",
        body: "Su proyecto «Tomate P2» quedó activo: la plata ya está en custodia y puede empezar el primer hito.",
        projectId: "p-1",
        milestoneId: null,
        payload: {},
        viaAssistant: true,
      },
    ]);
  });

  it("tells the producer what reached them for jornales, and what was paid to a supplier; the platform fee is silent", () => {
    const paid = (kind: string, beneficiary: string) =>
      noticesFor({ type: "line.paid", ...ms, lineId: "l", kind, beneficiary, amount: 540_000_00, currency: "COP", assetScale: 2 }, project);
    expect(paid("productor", "Productor")[0]).toMatchObject({ kind: "payment_done", body: "Le llegaron $540.000 de jornales del hito «Fertilización»." });
    expect(paid("proveedor", "Agroinsumos SAS")[0]).toMatchObject({ kind: "payment_done", body: "Se le pagaron $540.000 a Agroinsumos SAS por los insumos del hito «Fertilización»." });
    expect(paid("plataforma", "Plataforma Surco")).toEqual([]);
  });

  it("explains an observation with the fix in simple words, and an approval with what follows", () => {
    expect(noticesFor({ type: "milestone.observed", ...ms, reason: "Falta la foto georreferenciada del lote." }, project)[0]).toMatchObject({
      kind: "milestone_observed",
      body: "El verificador revisó el hito «Fertilización» y falta algo: la foto con la ubicación del lote. Corríjalo y mande la evidencia otra vez; la plata sigue segura en custodia.",
      milestoneId: "p-1-ms-2",
      viaAssistant: true,
    });
    expect(noticesFor({ type: "milestone.approved", ...ms }, project)[0]).toMatchObject({
      kind: "milestone_approved",
      body: "El verificador aprobó el hito «Fertilización». Los pagos de este hito salen ahora y se abre el siguiente.",
    });
  });

  it("notifies the verifier role (not the assistant) of new evidence, with photos and location", () => {
    expect(noticesFor({ type: "evidence.recorded", ...ms, stage: "submitted", photoCount: 2, location: { latitude: 4.6, longitude: -74.1 } }, project)).toEqual([
      {
        recipient: { role: "verifier" },
        kind: "evidence_submitted",
        title: "Hito para revisar",
        body: "El hito «Fertilización» de «Tomate P2» se envió a revisión: 2 fotos, con ubicación 4.6, -74.1.",
        projectId: "p-1",
        milestoneId: "p-1-ms-2",
        payload: { photoCount: 2, location: { latitude: 4.6, longitude: -74.1 } },
        viaAssistant: false,
      },
    ]);
    expect(noticesFor({ type: "evidence.recorded", ...ms, stage: "log", photoCount: 0, location: null }, project)[0]).toMatchObject({
      kind: "evidence_logged",
      body: "Nueva evidencia en el hito «Fertilización» de «Tomate P2»: sin fotos, sin ubicación.",
    });
  });

  it("tells the producer the harvest was settled", () => {
    expect(noticesFor({ type: "settlement.executed", projectId: "p-1", settlementId: "s-1" }, project)[0]).toMatchObject({
      kind: "settlement_executed",
      body: "La cosecha de «Tomate P2» quedó liquidada. Lo que le corresponde ya salió a su billetera.",
      payload: { settlementId: "s-1" },
    });
  });

  it("escalates «no entendí» to the technician (admin) with the conversation", () => {
    expect(noticesFor({ type: "assistant.escalated", userId: "u-prod", conversationId: "c-1", lastUserMessage: "No entendí" }, null)).toEqual([
      {
        recipient: { role: "admin" },
        kind: "assistant_escalated",
        title: "Un productor necesita ayuda",
        body: "El asistente no pudo ayudar a un productor. Su último mensaje: «No entendí». Llámelo.",
        projectId: null,
        milestoneId: null,
        payload: { userId: "u-prod", conversationId: "c-1" },
        viaAssistant: false,
      },
    ]);
  });

  it("says nothing to a producer when the milestone has no project", () => {
    expect(noticesFor({ type: "milestone.approved", projectId: null, milestoneId: "m1", milestoneTitle: "Siembra" }, null)).toEqual([]);
  });
});
