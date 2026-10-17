import { redirect } from "react-router";

// Legacy route: negotiations replaced "solicitudes de cotización".
export function clientLoader({ request }: { request: Request }) {
  return redirect(`/buyer/negotiations${new URL(request.url).search}`);
}
