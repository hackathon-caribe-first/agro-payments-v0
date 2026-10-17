import { redirect } from "react-router";
import type { Route } from "./+types/producer.project.presale";

// Legacy route: the presale page is gone; the project's negotiations replace it.
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return redirect(`/producer/negotiations?project=${encodeURIComponent(params.projectId)}`);
}
