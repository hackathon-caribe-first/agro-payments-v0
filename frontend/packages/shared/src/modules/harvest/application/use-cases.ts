import { err, type FieldErrors, ok } from "../../milestones/domain/errors";
import { attempt } from "../../milestones/application/use-cases";
import type { CertifyInput, Custody, DeclareInput, HarvestEnvelope, InvestorPanel } from "../domain/harvest";
import type { HarvestRepository } from "./harvest-repository";

// Same rules (and wire keys) as the backend's harvest.requests.ts, so a server rejection lands on the same field.
const wholeNumber = (raw: unknown) => {
  const text = String(raw ?? "").replace(/\./g, "").trim();
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
};
const textOf = (raw: unknown) => String(raw ?? "").trim();

function collect() {
  const fieldErrors: FieldErrors = {};
  const add = (key: string, message: string) => (fieldErrors[key] ??= []).push(message);
  return { fieldErrors, add, failed: () => Object.keys(fieldErrors).length > 0 };
}

export const getHarvest = (repo: HarvestRepository, projectId: string) =>
  attempt<HarvestEnvelope>(async () => {
    const found = await repo.get(projectId);
    return found ? ok(found) : err({ kind: "not_found" });
  });

export const listForReview = (repo: HarvestRepository) => attempt<HarvestEnvelope[]>(async () => ok(await repo.listForReview()));

export const declareHarvest = (repo: HarvestRepository, projectId: string, raw: DeclareInput) =>
  attempt<HarvestEnvelope>(async () => {
    const v = collect();
    const quantityKg = wholeNumber(raw.quantityKg);
    if (!(quantityKg > 0)) v.add("quantity_kg", "Ingresa la cantidad en kilos como un entero mayor a cero.");
    const qualityGrade = textOf(raw.qualityGrade);
    if (qualityGrade.length < 1 || qualityGrade.length > 60) v.add("quality_grade", "Ingresa la calidad (máximo 60 caracteres).");
    const evidence = textOf(raw.evidence);
    if (evidence.length < 3 || evidence.length > 1000) v.add("evidence", "Describe la evidencia de la cosecha (entre 3 y 1000 caracteres).");
    if (v.failed()) return err({ kind: "validation", fieldErrors: v.fieldErrors });
    return ok(await repo.declare(projectId, { quantityKg, qualityGrade, evidence }));
  });

export const certifyHarvest = (repo: HarvestRepository, projectId: string, raw: CertifyInput) =>
  attempt<HarvestEnvelope>(async () => {
    const v = collect();
    const quantityKg = wholeNumber(raw.quantityKg);
    if (!(quantityKg > 0)) v.add("certified_quantity_kg", "Ingresa la cantidad en kilos como un entero mayor a cero.");
    const qualityGrade = textOf(raw.qualityGrade);
    if (qualityGrade.length < 1 || qualityGrade.length > 60) v.add("quality_grade", "Ingresa la calidad (máximo 60 caracteres).");
    const pricePerKg = wholeNumber(raw.pricePerKg);
    if (!(pricePerKg > 0)) v.add("price.price_per_kg", "Ingresa un valor entero en pesos por kilo.");
    const notes = textOf(raw.notes);
    if (v.failed()) return err({ kind: "validation", fieldErrors: v.fieldErrors });
    return ok(await repo.certify(projectId, { quantityKg, qualityGrade, notes: notes === "" ? null : notes, pricePerKg }));
  });

export const payHarvest = (repo: HarvestRepository, projectId: string) => attempt<HarvestEnvelope>(async () => ok(await repo.pay(projectId)));

export const confirmReception = (repo: HarvestRepository, projectId: string) => attempt<HarvestEnvelope>(async () => ok(await repo.confirmReception(projectId)));

export const getCustody = (repo: HarvestRepository, projectId: string) =>
  attempt<Custody>(async () => {
    const found = await repo.custody(projectId);
    return found ? ok(found) : err({ kind: "not_found" });
  });

export const getInvestorPanel = (repo: HarvestRepository, projectId: string) =>
  attempt<InvestorPanel>(async () => {
    const found = await repo.panel(projectId);
    return found ? ok(found) : err({ kind: "not_found" });
  });
