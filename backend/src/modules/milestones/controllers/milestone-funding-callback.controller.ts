import { Controller, Get, Inject, Logger, Param, Query, Redirect } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { CompleteFundingUseCase } from "../application/complete-funding.use-case";

export const WEB_APP_URL = Symbol("WEB_APP_URL");

// No auth guard on purpose: the custody wallet's consent page redirects the browser here, often without our session cookie.
// What protects it is the pending grant: only the nonce we sent plus a matching GNAP hash finalize it.
@ApiExcludeController()
@Controller("milestones")
export class MilestoneFundingCallbackController {
  private readonly logger = new Logger(MilestoneFundingCallbackController.name);

  constructor(
    private readonly completeFunding: CompleteFundingUseCase,
    @Inject(WEB_APP_URL) private readonly webAppUrl: string,
  ) {}

  @Get(":id/funding/callback")
  @Redirect()
  async callback(@Param("id") id: string, @Query("interact_ref") interactRef?: string, @Query("hash") hash?: string) {
    const target = (param: string) => ({ url: `${this.webAppUrl}/custodio?${param}=${encodeURIComponent(id)}`, statusCode: 302 });
    // A rejected consent comes back without interact_ref.
    if (!interactRef) return target("funding_error");
    try {
      await this.completeFunding.execute(id, { interactRef, hash: hash ?? null });
      return target("funded");
    } catch (error) {
      // Message only: grant tokens never reach errors or logs.
      this.logger.warn(`Funding ${id} failed: ${error instanceof Error ? error.message : String(error)}`);
      return target("funding_error");
    }
  }
}
