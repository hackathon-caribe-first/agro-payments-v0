import { redirect } from "react-router";

// Legacy route: presale listings no longer exist (their ids map to nothing); buyers browse projects.
export function clientLoader() {
  return redirect("/buyer");
}
