import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { ApiAuthGuard } from "../controllers/api-auth.guard";
import { type AuthenticatedUser, type RequestHeaders, SessionResolver } from "../ports/session-resolver";
import { UserDirectory } from "../ports/user-directory";
import { DEMO_PARTIES, PublicIds } from "./demo-parties";
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
  async findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
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

// Block 3: the web app has no login and hardcodes "producer-main" / "buyer-andina"; DEMO_IDENTITY maps them to two seeded users.
const demoBuyer: AuthenticatedUser = { id: "b1", email: "comprador@agro.dev", name: "Comercializadora Andina S.A.S.", role: "buyer" };

describe("ResolveApiUserUseCase by side", () => {
  it("names the demo parties, their roles and the public ids the web app hardcodes", () => {
    expect(DEMO_PARTIES).toEqual({
      producer: { email: "productor@agro.dev", role: "seller", publicId: "producer-main" },
      buyer: { email: "comprador@agro.dev", role: "buyer", publicId: "buyer-andina" },
      investor: { email: "inversionista@agro.dev", role: "investor", publicId: "investor-demo" },
    });
  });

  it("DEMO_IDENTITY on: the investor side acts as the demo investor; a session still wins", async () => {
    const demoInvestor: AuthenticatedUser = { id: "i1", email: "inversionista@agro.dev", name: "Inversionista", role: "investor" };
    expect(await resolver(null, true, [demoProducer, demoInvestor]).useCase.execute({}, "investor")).toEqual(demoInvestor);
    expect(await resolver(sessionUser, true, [demoInvestor]).useCase.execute({}, "investor")).toEqual(sessionUser);
    await expect(resolver(null, true, [{ ...demoInvestor, role: "buyer" }]).useCase.execute({}, "investor")).rejects.toThrow(/inversionista@agro\.dev/);
  });

  it("DEMO_IDENTITY on: the buyer side acts as the demo buyer, the producer side (the default) as the demo producer", async () => {
    const { useCase } = resolver(null, true, [demoProducer, demoBuyer]);
    expect(await useCase.execute({}, "buyer")).toEqual(demoBuyer);
    expect(await useCase.execute({}, "producer")).toEqual(demoProducer);
    expect(await useCase.execute({})).toEqual(demoProducer);
  });

  it("a real session always wins over the side, and the flag off is still a 401", async () => {
    expect(await resolver(sessionUser, true).useCase.execute({}, "buyer")).toEqual(sessionUser);
    await expect(resolver(null, false, [demoBuyer]).useCase.execute({}, "buyer")).rejects.toThrow(UnauthorizedException);
  });

  it("a demo buyer that is missing or not a buyer is a 401 that names it", async () => {
    await expect(resolver(null, true, [demoProducer]).useCase.execute({}, "buyer")).rejects.toThrow(/comprador@agro\.dev/);
    await expect(resolver(null, true, [{ ...demoBuyer, role: "seller" }]).useCase.execute({}, "buyer")).rejects.toThrow(UnauthorizedException);
  });

  it("candidates: the session alone, or both demo parties for reads either side may make", async () => {
    expect(await resolver(sessionUser, true).useCase.candidates({})).toEqual([sessionUser]);
    expect(await resolver(null, true, [demoProducer, demoBuyer]).useCase.candidates({})).toEqual([demoBuyer, demoProducer]);
    await expect(resolver(null, false).useCase.candidates({})).rejects.toThrow(UnauthorizedException);
  });
});

describe("PublicIds", () => {
  it("DEMO_IDENTITY off: a public id is the user id", async () => {
    const ids = await new PublicIds(new FakeDirectory([demoProducer, demoBuyer]), false).table();
    expect([ids.toPublic("d1"), ids.toUser("buyer-andina")]).toEqual(["d1", "buyer-andina"]);
  });

  it("DEMO_IDENTITY on: the demo users round-trip as producer-main / buyer-andina; everyone else keeps their id", async () => {
    const ids = await new PublicIds(new FakeDirectory([demoProducer, demoBuyer]), true).table();
    expect([ids.toPublic("d1"), ids.toPublic("b1"), ids.toPublic("x")]).toEqual(["producer-main", "buyer-andina", "x"]);
    expect([ids.toUser("producer-main"), ids.toUser("buyer-andina"), ids.toUser("x")]).toEqual(["d1", "b1", "x"]);
  });
});
