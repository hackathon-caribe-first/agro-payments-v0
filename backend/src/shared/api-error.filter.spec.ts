import type { ArgumentsHost } from "@nestjs/common";
import { ApiErrorFilter } from "./api-error.filter";
import { DomainError, NotFoundError, ValidationError } from "./domain-errors";

const respond = (error: Error) => {
  const sent: { status?: number; body?: unknown } = {};
  const response = { status: (code: number) => ((sent.status = code), { json: (body: unknown) => void (sent.body = body) }) };
  new ApiErrorFilter().catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
  return sent;
};

// The web app parses { error?: string, errors: { [fieldPath]: string[] } } on 400/409.
describe("ApiErrorFilter", () => {
  it("maps a ValidationError to 400 with its field errors", () => {
    expect(respond(new ValidationError({ "milestones.0.laborBudget": ["x"] }, "Invalid project payload"))).toEqual({
      status: 400,
      body: { error: "Invalid project payload", errors: { "milestones.0.laborBudget": ["x"] } },
    });
  });

  it("maps a refused transition to 409 and a missing resource to 404, both with empty field errors", () => {
    expect(respond(new DomainError("Evidence is not accepted in status LOCKED"))).toEqual({
      status: 409,
      body: { error: "Evidence is not accepted in status LOCKED", errors: {} },
    });
    expect(respond(new NotFoundError("Project p not found"))).toEqual({ status: 404, body: { error: "Project p not found", errors: {} } });
  });
});
