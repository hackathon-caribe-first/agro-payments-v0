import { redirect } from "react-router";
import { auth } from "~/auth/module";

// Resource route: the sidebar and the 403 view post here. A plain visit (GET) just goes to the sign-in page.
export function clientLoader() {
  return redirect("/login");
}

export async function clientAction() {
  await auth.signOut();
  return redirect("/login");
}

export default function Logout() {
  return null;
}
