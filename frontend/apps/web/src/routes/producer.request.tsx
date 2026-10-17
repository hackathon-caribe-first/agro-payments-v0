import { redirect } from "react-router";
import type { Route } from "./+types/producer.request";

// Legacy route: the same id now opens the negotiation detail.
export function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  return redirect(`/producer/negotiations/${params.requestId}${new URL(request.url).search}`);
}
