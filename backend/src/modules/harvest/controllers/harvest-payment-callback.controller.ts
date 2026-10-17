import { Controller, Get, Inject, Logger, Param, Query, Redirect } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { HarvestUseCases } from "../application/harvest.use-cases";

export const HARVEST_WEB_APP_URL = Symbol("HARVEST_WEB_APP_URL");

// No auth guard on purpose, like the deposit callback: the buyer's wallet redirects the browser here, often without our session
// cookie. What protects it is the pending harvest_payment grant: only our nonce plus a matching GNAP hash finalize it.
@ApiExcludeController()
@Controller("api/projects")
export class HarvestPaymentCallbackController {
  private readonly logger = new Logger(HarvestPaymentCallbackController.name);

  constructor(
    private readonly harvests: HarvestUseCases,
    @Inject(HARVEST_WEB_APP_URL) private readonly webAppUrl: string,
  ) {}

  @Get(":id/harvest/payment/callback")
  @Redirect()
  async callback(@Param("id") id: string, @Query("interact_ref") interactRef?: string, @Query("hash") hash?: string) {
    const target = (result: "ok" | "error") => ({ url: `${this.webAppUrl}/buyer/projects/${encodeURIComponent(id)}?harvest_payment=${result}`, statusCode: 302 });
    // A rejected consent comes back without interact_ref.
    if (!interactRef) return target("error");
    try {
      await this.harvests.completePayment(id, { interactRef, hash: hash ?? null });
      return target("ok");
    } catch (error) {
      // Message only: grant tokens never reach errors or logs.
      this.logger.warn(`Harvest payment ${id} failed: ${error instanceof Error ? error.message : String(error)}`);
      return target("error");
    }
  }
}
