import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { ApiAuthGuard } from "../controllers/api-auth.guard";
import { type AuthenticatedUser, type RequestHeaders, SessionResolver } from "../ports/session-resolver";
import { UserDirectory } from "../ports/user-directory";
import { DEMO_PRODUCER_EMAIL, ResolveApiUserUseCase } from "./resolve-api-user.use-case";

const sessionUser: AuthenticatedUser = { id: "s1", email: "real@agro.dev", name: "Real", role: "fidu" };
const demoProducer: AuthenticatedUser = { id: "d1", email: DEMO_PRODUCER_EMAIL, name: "Productor", role: "seller" };

class FakeSessions extends SessionResolver {
  constructor(private readonly user: AuthenticatedUser | null) {
    super();
  }
  async resolve(_headers: RequestHeaders) {
    return this.user;
  }
}

class FakeDirectory extends UserDirectory {
  readonly lookups: string[] = [];
  constructor(private readonly users: AuthenticatedUser[]) {
    super();
  }
  async findByEmail(email: string) {
    this.lookups.push(email);
    return this.users.find((u) => u.email === email) ?? null;
  }
}

const resolver = (session: AuthenticatedUser | null, demo: boolean, users: AuthenticatedUser[] = [demoProducer]) => {
  const directory = new FakeDirectory(users);
  return { directory, useCase: new ResolveApiUserUseCase(new FakeSessions(session), directory, demo) };
};

describe("ResolveApiUserUseCase", () => {
  it("is the demo producer email seeded in the dev database", () => {
    expect(DEMO_PRODUCER_EMAIL).toBe("productor@agro.dev");
  });

  it("uses the real session when there is one, in both modes", async () => {
    for (const demo of [false, true]) {
      const { useCase, directory } = resolver(sessionUser, demo);
      expect(await useCase.execute({})).toEqual(sessionUser);
      expect(directory.lookups).toEqual([]);
    }
  });

  it("DEMO_IDENTITY off: no session is 401", async () => {
    const { useCase, directory } = resolver(null, false);
    await expect(useCase.execute({})).rejects.toThrow(UnauthorizedException);
    expect(directory.lookups).toEqual([]);
  });

  it("DEMO_IDENTITY on: no session acts as the demo producer looked up by email", async () => {
    const { useCase, directory } = resolver(null, true);
    expect(await useCase.execute({})).toEqual(demoProducer);
    expect(directory.lookups).toEqual([DEMO_PRODUCER_EMAIL]);
  });

  it("DEMO_IDENTITY on: a missing demo producer is a 401 that names it, never a created user", async () => {
    await expect(resolver(null, true, []).useCase.execute({})).rejects.toThrow(/productor@agro\.dev/);
    await expect(resolver(null, true, [{ ...demoProducer, role: "admin" }]).useCase.execute({})).rejects.toThrow(UnauthorizedException);
  });

  it("ignores identity claims in headers or body: only the session or the fixed demo email count", async () => {
    const { useCase } = resolver(null, true, [demoProducer, { ...sessionUser, email: "producer-main" }]);
    expect(await useCase.execute({ "x-user-id": "producer-main" })).toEqual(demoProducer);
  });
});

describe("ApiAuthGuard", () => {
  const contextFor = (request: object) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  it("puts the resolved user on the request for RolesGuard and @CurrentUser()", async () => {
    const request: { headers: RequestHeaders; user?: AuthenticatedUser } = { headers: {} };
    expect(await new ApiAuthGuard(resolver(null, true).useCase).canActivate(contextFor(request))).toBe(true);
    expect(request.user).toEqual(demoProducer);
  });

  it("rejects without a session when DEMO_IDENTITY is off", async () => {
    await expect(new ApiAuthGuard(resolver(null, false).useCase).canActivate(contextFor({ headers: {} }))).rejects.toThrow(UnauthorizedException);
  });
});
