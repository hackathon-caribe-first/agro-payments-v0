import { Body, Controller, Get, HttpCode, Param, Post, Put, UseFilters, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { CurrentUser } from "../../auth/controllers/current-user.decorator";
import { Roles } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import type { AuthenticatedUser } from "../../auth/ports/session-resolver";
import { MILESTONE_ROLES } from "../../milestones/controllers/milestone-roles";
import { ConverseUseCase, IntentDecisionUseCase } from "../application/assistant.use-cases";
import { PinUseCase } from "../application/pin";
import {
  AssistantUnavailableFilter,
  parseConfirmRequest,
  parseMessageRequest,
  parsePinRequest,
  toConversationResponse,
  toDecisionResponse,
  toReplyResponse,
} from "./assistant.http";

// Producer chat (PRD v3 RF-33..RF-41). Bodies stay unknown so the global ValidationPipe passes them through; rules live in
// the use cases. The PIN only ever arrives on confirm and PUT pin, and is never returned.
// ponytail: not in openapi.yaml yet (regenerate with `pnpm openapi` when the web app consumes it through the typed client).
@ApiTags("assistant")
@Controller("api/assistant")
@UseGuards(ApiAuthGuard, RolesGuard)
@UseFilters(ApiErrorFilter, AssistantUnavailableFilter)
@Roles(MILESTONE_ROLES.producer)
export class AssistantController {
  constructor(
    private readonly converse: ConverseUseCase,
    private readonly decisions: IntentDecisionUseCase,
    private readonly pins: PinUseCase,
  ) {}

  /** Send a message; answers the reply and, when a tool prepared one, the pending intent to confirm */
  @Post("messages")
  @HttpCode(200)
  async sendMessage(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return toReplyResponse(await this.converse.send(user, parseMessageRequest(body)));
  }

  /** The producer's own conversation with its messages and intents (RF-41 audit) */
  @Get("conversations/:id")
  async getConversation(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return toConversationResponse(await this.converse.get(user, id));
  }

  /** Explicit «sí»; order lines also need { pin } */
  @Post("intents/:id/confirm")
  @HttpCode(200)
  async confirm(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return toDecisionResponse(await this.decisions.confirm(user, id, parseConfirmRequest(body).pin));
  }

  @Post("intents/:id/reject")
  @HttpCode(200)
  async reject(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return toDecisionResponse(await this.decisions.reject(user, id));
  }

  /** Whether the producer has a PIN, so the UI can ask to create one before the first order */
  @Get("pin")
  async pinStatus(@CurrentUser() user: AuthenticatedUser) {
    const { pinSet, locked } = await this.pins.status(user.id);
    return { pin_set: pinSet, locked };
  }

  /** Create the 4-digit PIN, or change it with { pin, current_pin } */
  @Put("pin")
  @HttpCode(204)
  async setPin(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    await this.pins.set(user.id, parsePinRequest(body));
  }
}
