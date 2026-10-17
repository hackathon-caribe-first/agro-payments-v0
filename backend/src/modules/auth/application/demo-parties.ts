import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "../ports/role";
import { UserDirectory } from "../ports/user-directory";

/** DI token: the parsed DEMO_IDENTITY flag. */
export const DEMO_IDENTITY = Symbol("DEMO_IDENTITY");

export const PARTY_SIDE = { BUYER: "buyer", PRODUCER: "producer", INVESTOR: "investor" } as const;
export type PartySide = (typeof PARTY_SIDE)[keyof typeof PARTY_SIDE];

type DemoParty = { email: string; role: Role; publicId: string };

// ponytail: demo only (DEMO_IDENTITY=true), never in production; remove when the web app signs in (RF-01).
// THE alias table. Without a session, an /api request acts as the seeded user of its side, and those users appear on the wire
// under the ids the web app hardcodes (frontend/apps/web/src/{producer/presales,buyer/module}.ts). With the flag off a public id
// is the user id. Which side a route is on is decided in negotiations/controllers/party-side.ts; every investments route is
// on the investor side (block 4).
export const DEMO_PARTIES = {
  producer: { email: "productor@agro.dev", role: "seller", publicId: "producer-main" },
  buyer: { email: "comprador@agro.dev", role: "buyer", publicId: "buyer-andina" },
  investor: { email: "inversionista@agro.dev", role: "investor", publicId: "investor-capital-verde" },
} as const satisfies Record<PartySide, DemoParty>;

export type IdAliases = { toPublic(userId: string): string; toUser(publicId: string): string };

const IDENTITY: IdAliases = { toPublic: (id) => id, toUser: (id) => id };

@Injectable()
export class PublicIds {
  constructor(
    private readonly directory: UserDirectory,
    @Inject(DEMO_IDENTITY) private readonly demoIdentity: boolean,
  ) {}

  /** Looked up per call: a demo user signed up after startup is picked up without a restart. */
  async table(): Promise<IdAliases> {
    if (!this.demoIdentity) return IDENTITY;
    const pairs: [string, string][] = [];
    for (const party of Object.values(DEMO_PARTIES)) {
      const user = await this.directory.findByEmail(party.email);
      if (user) pairs.push([user.id, party.publicId]);
    }
    const toPublic = new Map(pairs);
    const toUser = new Map(pairs.map(([user, pub]) => [pub, user]));
    return { toPublic: (id) => toPublic.get(id) ?? id, toUser: (id) => toUser.get(id) ?? id };
  }
}
