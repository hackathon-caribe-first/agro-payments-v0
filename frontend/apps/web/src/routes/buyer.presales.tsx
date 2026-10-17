import { redirect } from "react-router";
import type { Route } from "./+types/buyer.presales";

// Legacy route: buyers browse published projects now.
export function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  return redirect(`/buyer/projects/${params.listingId}${new URL(request.url).search}`);
}
