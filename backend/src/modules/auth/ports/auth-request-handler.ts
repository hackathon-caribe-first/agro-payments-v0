import type { IncomingMessage, ServerResponse } from "node:http";

// Serves the sign-up / sign-in / sign-out / session endpoints of the auth provider.
export abstract class AuthRequestHandler {
  abstract handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
