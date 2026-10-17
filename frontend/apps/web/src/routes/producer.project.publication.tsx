import { redirect } from "react-router";
import type { Route } from "./+types/producer.project.publication";

// Legacy route: there is no publication step any more; the project's negotiations replace the page.
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return redirect(`/producer/negotiations?project=${encodeURIComponent(params.projectId)}`);
}
