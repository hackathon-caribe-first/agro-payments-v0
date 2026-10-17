import { err, ok } from "../../milestones/domain/errors";
import { toFieldErrors } from "../../milestones/schemas/evidence-log";
import { attemptHarvest, type HarvestResult } from "../domain/errors";
import type { DeclarationContext, HarvestBatch, OrderDetail, PurchaseOrder, Settlement } from "../domain/harvest";
import { buildCertifyHarvestSchema, requestCorrectionsSchema } from "../schemas/certify-harvest";
import { declareHarvestSchema } from "../schemas/declare-harvest";
import { authorizeOrderSchema, buildCreateOrderSchema, dispatchOrderSchema } from "../schemas/order-forms";
import type { HarvestRepository } from "./harvest-repository";

export interface HarvestDeps {
  harvest: HarvestRepository;
}

const notFound = () => err({ kind: "not_found" } as const);

// Reads ---------------------------------------------------------------------------------------------------------

export const getDeclarationContext = (deps: HarvestDeps, projectId: string): Promise<HarvestResult<DeclarationContext>> =>
  attemptHarvest(async () => {
    const context = await deps.harvest.getDeclarationContext(projectId);
    return context ? ok(context) : notFound();
  });

export const listVerifierBatches = (deps: HarvestDeps): Promise<HarvestResult<HarvestBatch[]>> =>
  attemptHarvest(async () => ok(await deps.harvest.listBatches({ status: "DECLARED_BY_PRODUCER" })));

export const getBatch = (deps: HarvestDeps, batchId: string): Promise<HarvestResult<HarvestBatch>> =>
  attemptHarvest(async () => {
    const batch = await deps.harvest.getBatch(batchId);
    return batch ? ok(batch) : notFound();
  });

export const listLots = (deps: HarvestDeps, productionType?: string): Promise<HarvestResult<HarvestBatch[]>> =>
  attemptHarvest(async () => ok(await deps.harvest.listLots(productionType)));

export const getLot = (deps: HarvestDeps, batchId: string): Promise<HarvestResult<HarvestBatch>> =>
  attemptHarvest(async () => {
    const lot = await deps.harvest.getLot(batchId);
    return lot ? ok(lot) : notFound();
  });

export const listBuyerOrders = (deps: HarvestDeps, buyerId: string): Promise<HarvestResult<PurchaseOrder[]>> =>
  attemptHarvest(async () => ok(await deps.harvest.listOrders({ buyerId })));

export const listProducerOrders = (deps: HarvestDeps, producerId: string): Promise<HarvestResult<PurchaseOrder[]>> =>
  attemptHarvest(async () => ok(await deps.harvest.listOrders({ producerId })));

export const getOrderDetail = (deps: HarvestDeps, orderId: string): Promise<HarvestResult<OrderDetail>> =>
  attemptHarvest(async () => {
    const detail = await deps.harvest.getOrderDetail(orderId);
    return detail ? ok(detail) : notFound();
  });

export const listProjectSettlements = (deps: HarvestDeps, projectId: string): Promise<HarvestResult<Settlement[]>> =>
  attemptHarvest(async () => ok(await deps.harvest.listSettlements(projectId)));

export const listAllSettlements = (deps: HarvestDeps): Promise<HarvestResult<Settlement[]>> =>
  attemptHarvest(async () => ok(await deps.harvest.listAllSettlements()));

// Producer actions -----------------------------------------------------------------------------------------------

export const declareHarvest = (deps: HarvestDeps, projectId: string, raw: unknown): Promise<HarvestResult<HarvestBatch>> =>
  attemptHarvest(async () => {
    const parsed = declareHarvestSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.harvest.declare(projectId, parsed.data));
  });

export const resubmitHarvest = (deps: HarvestDeps, batchId: string, raw: unknown): Promise<HarvestResult<HarvestBatch>> =>
  attemptHarvest(async () => {
    const parsed = declareHarvestSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.harvest.resubmit(batchId, parsed.data));
  });

export const dispatchOrder = (deps: HarvestDeps, orderId: string, raw: unknown): Promise<HarvestResult<OrderDetail>> =>
  attemptHarvest(async () => {
    const parsed = dispatchOrderSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.harvest.dispatch(orderId, parsed.data));
  });

// Verifier actions -----------------------------------------------------------------------------------------------

export const certifyHarvest = (deps: HarvestDeps, batchId: string, raw: unknown): Promise<HarvestResult<HarvestBatch>> =>
  attemptHarvest(async () => {
    const batch = await deps.harvest.getBatch(batchId);
    if (!batch) return notFound();
    const parsed = buildCertifyHarvestSchema(batch.declaredKg).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.harvest.certify(batchId, parsed.data));
  });

export const requestHarvestCorrections = (deps: HarvestDeps, batchId: string, raw: unknown): Promise<HarvestResult<HarvestBatch>> =>
  attemptHarvest(async () => {
    const parsed = requestCorrectionsSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.harvest.requestCorrections(batchId, parsed.data.comments));
  });

// Buyer actions --------------------------------------------------------------------------------------------------

export const createPurchaseOrder = (deps: HarvestDeps, batchId: string, buyerId: string, raw: unknown): Promise<HarvestResult<PurchaseOrder>> =>
  attemptHarvest(async () => {
    const lot = await deps.harvest.getLot(batchId);
    if (!lot) return notFound();
    const parsed = buildCreateOrderSchema(lot.availableKg).safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.harvest.createOrder(batchId, buyerId, parsed.data.quantityKg));
  });

export const authorizeOrderPayment = (deps: HarvestDeps, orderId: string, buyerId: string, raw: unknown): Promise<HarvestResult<OrderDetail>> =>
  attemptHarvest(async () => {
    const parsed = authorizeOrderSchema.safeParse(raw);
    if (!parsed.success) return err({ kind: "validation", fieldErrors: toFieldErrors(parsed.error) });
    return ok(await deps.harvest.authorizePayment(orderId, buyerId, parsed.data.expectedTotal));
  });

export const revokeOrderAuthorization = (deps: HarvestDeps, orderId: string, buyerId: string): Promise<HarvestResult<OrderDetail>> =>
  attemptHarvest(async () => ok(await deps.harvest.revokeAuthorization(orderId, buyerId)));

export const cancelOrder = (deps: HarvestDeps, orderId: string, buyerId: string): Promise<HarvestResult<OrderDetail>> =>
  attemptHarvest(async () => ok(await deps.harvest.cancelOrder(orderId, buyerId)));

export const confirmOrderReception = (deps: HarvestDeps, orderId: string, buyerId: string): Promise<HarvestResult<OrderDetail>> =>
  attemptHarvest(async () => ok(await deps.harvest.confirmReception(orderId, buyerId)));
