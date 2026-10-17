import { redirect } from "react-router";

export function clientLoader() {
  return redirect("/producer");
}

export default function Index() {
  return null;
}
