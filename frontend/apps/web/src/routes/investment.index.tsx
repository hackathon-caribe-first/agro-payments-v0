import { redirect } from "react-router";

// /investor is the module entry (sidebar link): it lands on the project catalog.
export function clientLoader() {
  return redirect("/investor/catalog");
}

export default function InvestmentIndex() {
  return null;
}
