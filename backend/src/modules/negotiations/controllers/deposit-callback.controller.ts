import { Controller, Get, Inject, Logger, Param, Query, Redirect } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { NegotiationsService } from "../application/negotiations.service";

export const DEPOSIT_WEB_APP_URL = Symbol("DEPOSIT_WEB_APP_URL");

// No auth guard on purpose, like the milestone funding callback: the buyer's wallet redirects the browser here, often without
// our session cookie. What protects it is the pending buyer_deposit grant: only our nonce plus a matching GNAP hash finalize it.
@ApiExcludeController()
@Controller("api/negotiations")
export class DepositCallbackController {
  private readonly logger = new Logger(DepositCallbackController.name);

  constructor(
    private readonly service: NegotiationsService,
    @Inject(DEPOSIT_WEB_APP_URL) private readonly webAppUrl: string,
  ) {}

  @Get(":id/deposit/callback")
  @Redirect()
  async callback(@Param("id") id: string, @Query("interact_ref") interactRef?: string, @Query("hash") hash?: string) {
    const target = (result: "ok" | "error") => ({ url: `${this.webAppUrl}/buyer/negotiations/${encodeURIComponent(id)}?deposit=${result}`, statusCode: 302 });
    // A rejected consent comes back without interact_ref.
    if (!interactRef) return target("error");
    try {
      await this.service.completeDeposit(id, { interactRef, hash: hash ?? null });
      return target("ok");
    } catch (error) {
      // Message only: grant tokens never reach errors or logs.
      this.logger.warn(`Deposit ${id} failed: ${error instanceof Error ? error.message : String(error)}`);
      return target("error");
    }
  }
}
