import type { IncomingMessage, ServerResponse } from "node:http";
import { Inject, Injectable } from "@nestjs/common";
import { toNodeHandler } from "better-auth/node";
import { AuthRequestHandler } from "../../ports/auth-request-handler";
import type { BetterAuthInstance } from "../better-auth.factory";
import { BETTER_AUTH } from "../better-auth.provider";

@Injectable()
export class BetterAuthRequestAdapter extends AuthRequestHandler {
  private readonly handler: ReturnType<typeof toNodeHandler>;

  constructor(@Inject(BETTER_AUTH) auth: BetterAuthInstance) {
    super();
    this.handler = toNodeHandler(auth);
  }

  async handle(req: IncomingMessage, res: ServerResponse) {
    await this.handler(req, res);
  }
}
