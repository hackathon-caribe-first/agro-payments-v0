import { AuditErrorBoundary, AuditPage } from "~/components/audit/audit-page";
import { audit } from "~/audit/module";
import { unwrapOps } from "~/panel/error-copy";
import type { Route } from "./+types/audit.investor-project";

export const meta = () => [{ title: "Auditoría del proyecto · Surco" }];

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return unwrapOps(await audit.loadProjectAudit(params.projectId));
}

export default function InvestorProjectAudit({ loaderData }: Route.ComponentProps) {
  return <AuditPage timeline={loaderData} viewer="investor" />;
}

export function ErrorBoundary() {
  return <AuditErrorBoundary back="/investor/projects" />;
}
