import { Controller, Get, Inject, Logger, Param, Query, Redirect } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { WEB_APP_URL } from "../../milestones/controllers/milestone-funding-callback.controller";
import { ContractsUseCases } from "../application/contracts.use-cases";

// No auth guard on purpose: the custody wallet's consent page redirects the browser here, often without our session cookie.
// What protects it is the pending premium grant: only the nonce we sent plus a matching GNAP hash finalize it.
@ApiExcludeController()
@Controller("api/projects")
export class PremiumGrantCallbackController {
  private readonly logger = new Logger(PremiumGrantCallbackController.name);

  constructor(
    private readonly contracts: ContractsUseCases,
    @Inject(WEB_APP_URL) private readonly webAppUrl: string,
  ) {}

  @Get(":projectId/insurance-policy/premium-grant/callback")
  @Redirect()
  async callback(@Param("projectId") projectId: string, @Query("interact_ref") interactRef?: string, @Query("hash") hash?: string) {
    const target = (param: string) => ({ url: `${this.webAppUrl}/custodian?${param}=${encodeURIComponent(projectId)}`, statusCode: 302 });
    if (!interactRef) return target("premium_error");
    try {
      await this.contracts.completePremiumGrant(projectId, { interactRef, hash: hash ?? null });
      return target("premium_granted");
    } catch (error) {
      // Message only: grant tokens never reach errors or logs.
      this.logger.warn(`Premium grant for ${projectId} failed: ${error instanceof Error ? error.message : String(error)}`);
      return target("premium_error");
    }
  }
}
