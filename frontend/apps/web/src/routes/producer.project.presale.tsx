import { redirect } from "react-router";
import type { Route } from "./+types/producer.project.presale";

// Legacy route: the presale page is now the project's publication page.
export function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  return redirect(`/producer/projects/${params.projectId}/publication${new URL(request.url).search}`);
}
