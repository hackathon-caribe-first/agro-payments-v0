import { redirect } from "react-router";
import type { Route } from "./+types/buyer.request";

// Legacy route: the same id now opens the negotiation detail.
export function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  return redirect(`/buyer/negotiations/${params.requestId}${new URL(request.url).search}`);
}
