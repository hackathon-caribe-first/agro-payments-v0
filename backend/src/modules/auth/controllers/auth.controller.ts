import { All, Controller, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthRequestHandler } from "../ports/auth-request-handler";

// Better Auth owns everything under /api/auth/* (sign-up, sign-in, sign-out, get-session...).
// It reads the raw request stream, so main.ts keeps the body parsers off this path.
@ApiExcludeController()
@Controller("api/auth")
export class AuthController {
  constructor(private readonly handler: AuthRequestHandler) {}

  @All("*path")
  handle(@Req() req: Request, @Res() res: Response) {
    return this.handler.handle(req, res);
  }
}
