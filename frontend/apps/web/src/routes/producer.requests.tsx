import { redirect } from "react-router";

// Legacy route: keeps ?project= so the project filter survives.
export function clientLoader({ request }: { request: Request }) {
  return redirect(`/producer/negotiations${new URL(request.url).search}`);
}
