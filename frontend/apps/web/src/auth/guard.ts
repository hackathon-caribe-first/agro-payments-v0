import { data, redirect } from "react-router";
import { canAccess, homePathFor } from "@agro/shared/modules/auth/domain/access";
import type { Session } from "@agro/shared/modules/auth/domain/role";
import { auth } from "./module";
import { ownsRecord } from "./ownership";

export const loginPath = (next: string) => `/login?next=${encodeURIComponent(next)}`;

export async function currentSession(): Promise<Session | null> {
  const result = await auth.getSession();
  return result.ok ? result.value : null;
}

// RNF-07: every protected page goes through here (from the layout). No session -> sign in and come back; a role that
// cannot open the path -> 403 carrying the session, so the layout error view can still show the sidebar of that role.
export async function requireSession(request: Request): Promise<Session> {
  const url = new URL(request.url);
  const session = await currentSession();
  if (!session) throw redirect(loginPath(`${url.pathname}${url.search}`));
  if (!canAccess(session.role, url.pathname)) throw data({ session }, { status: 403, statusText: "Forbidden" });
  // "Por proyecto": a record of somebody else answers like a missing one.
  if (!(await ownsRecord(session, url.pathname))) throw data(null, { status: 404 });
  return session;
}

// The page of a role to land on (root, post sign-in).
export const homeFor = (session: Session | null) => (session ? homePathFor(session.role) : "/login");
