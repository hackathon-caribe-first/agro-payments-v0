import { Controller, Get, Inject, Logger, Param, Query, Redirect } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { WEB_APP_URL } from "../../milestones/controllers/milestone-funding-callback.controller";
import { SettlementUseCases } from "../application/settlement.use-cases";

// No auth guard on purpose: the custody wallet's consent page redirects the browser here, often without our session cookie.
// What protects it is the pending liquidation grant: only the nonce we sent plus a matching GNAP hash finalize it.
@ApiExcludeController()
@Controller("api/settlements")
export class LiquidationGrantCallbackController {
  private readonly logger = new Logger(LiquidationGrantCallbackController.name);

  constructor(
    private readonly settlements: SettlementUseCases,
    @Inject(WEB_APP_URL) private readonly webAppUrl: string,
  ) {}

  @Get(":id/liquidation-grant/callback")
  @Redirect()
  async callback(@Param("id") id: string, @Query("interact_ref") interactRef?: string, @Query("hash") hash?: string) {
    const target = (param: string) => ({ url: `${this.webAppUrl}/custodian?${param}=${encodeURIComponent(id)}`, statusCode: 302 });
    if (!interactRef) return target("liquidation_error");
    try {
      await this.settlements.completeLiquidationGrant(id, { interactRef, hash: hash ?? null });
      return target("liquidation_granted");
    } catch (error) {
      // Message only: grant tokens never reach errors or logs.
      this.logger.warn(`Liquidation grant for ${id} failed: ${error instanceof Error ? error.message : String(error)}`);
      return target("liquidation_error");
    }
  }
}
