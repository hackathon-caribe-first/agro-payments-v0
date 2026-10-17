import { Controller, Get, Inject, Logger, Param, Query, Redirect } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { INVESTMENT_STATUS } from "../domain/investment";
import { InvestmentUseCases } from "../application/investments.use-cases";

export const INVESTMENT_WEB_APP_URL = Symbol("INVESTMENT_WEB_APP_URL");

// No auth guard on purpose, like the deposit and funding callbacks: the investor's wallet redirects the browser here, often
// without our session cookie. What protects it is the pending investor_capture grant: only our nonce plus a matching GNAP hash
// finalize it. A rejected consent changes nothing (anyone can call this URL); the reservation lapses on its own.
@ApiExcludeController()
@Controller("api")
export class InvestmentCallbackController {
  private readonly logger = new Logger(InvestmentCallbackController.name);

  constructor(
    private readonly investments: InvestmentUseCases,
    @Inject(INVESTMENT_WEB_APP_URL) private readonly webAppUrl: string,
  ) {}

  @Get("investments/:id/callback")
  @Redirect()
  async callback(@Param("id") id: string, @Query("interact_ref") interactRef?: string, @Query("hash") hash?: string) {
    const projectId = await this.investments.projectOf(id);
    const page = projectId ? `/investor/projects/${encodeURIComponent(projectId)}` : "/investor";
    const target = (result: "ok" | "error") => ({ url: `${this.webAppUrl}${page}?capture=${result}`, statusCode: 302 });
    if (!projectId || !interactRef) return target("error");
    try {
      const investment = await this.investments.completeConsent(id, { interactRef, hash: hash ?? null });
      if (investment.status === INVESTMENT_STATUS.CAPTURED) return target("ok");
      this.logger.warn(`Investment ${id} failed: ${investment.failureReason ?? "unknown"}`);
      return target("error");
    } catch (error) {
      // Message only: grant tokens never reach errors or logs.
      this.logger.warn(`Investment ${id} callback refused: ${error instanceof Error ? error.message : String(error)}`);
      return target("error");
    }
  }
}
