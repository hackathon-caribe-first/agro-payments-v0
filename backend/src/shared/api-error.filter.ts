import { type ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { DomainError, NotFoundError, ValidationError } from "./domain-errors";

type HttpResponse = { status(code: number): { json(body: unknown): void } };

// Error body of the /api controllers, the shape the web app parses: { error, errors: { [fieldPath]: string[] } }.
// Scoped with @UseFilters on those controllers; legacy routes keep DomainErrorFilter's { statusCode, message }.
@Catch(DomainError, ValidationError)
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: DomainError | ValidationError, host: ArgumentsHost) {
    const status = error instanceof ValidationError ? 400 : error instanceof NotFoundError ? 404 : 409;
    const errors = error instanceof ValidationError ? error.fieldErrors : {};
    host.switchToHttp().getResponse<HttpResponse>().status(status).json({ error: error.message, errors });
  }
}
