import { redirect } from "react-router";
import { currentSession, homeFor } from "~/auth/guard";

// The root sends each signed-in role to its own home; without a session, to the sign-in page.
export async function clientLoader() {
  return redirect(homeFor(await currentSession()));
}

export default function Index() {
  return null;
}
