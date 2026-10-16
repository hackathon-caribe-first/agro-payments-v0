import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { DomainError, NotFoundError } from "./domain-errors";

type HttpResponse = { status(code: number): { json(body: unknown): void } };

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const status = error instanceof NotFoundError ? 404 : 409;
    host.switchToHttp().getResponse<HttpResponse>().status(status).json({ statusCode: status, message: error.message });
  }
}
