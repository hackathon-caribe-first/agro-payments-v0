import { ArrowLeft } from "lucide-react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import type { AuditTimeline, AuditViewer } from "@agro/shared/modules/audit/domain/audit";
import { AuditTimelineView } from "./audit-timeline";

const BACK: Record<AuditViewer, { to: (projectId: string) => string; label: string }> = {
  producer: { to: (id) => `/producer/projects/${id}`, label: "Volver al proyecto" },
  // Funded projects are not in the investor catalog (/investor/projects/:id would be a 404): go back to the panel.
  investor: { to: () => "/investor/panel", label: "Volver a mi panel" },
};

// Shared by the producer and the investor routes: same timeline, links resolved for the viewer.
export function AuditPage({ timeline, viewer }: { timeline: AuditTimeline; viewer: AuditViewer }) {
  const back = BACK[viewer];
  return (
    <div className="flex flex-col gap-6">
      <Link to={back.to(timeline.project.id)} className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      <header>
        <p className="text-sm text-muted-foreground">Auditoría del proyecto · Estado actual: {timeline.project.statusLabel}</p>
        <h1 className="break-words text-3xl text-primary">{timeline.project.title}</h1>
        <p className="mt-2 max-w-prose text-pretty text-muted-foreground">
          Cada cambio de estado, dictamen, grant y pago queda con su fecha, quién lo hizo y por qué. Es un registro de solo lectura.
        </p>
      </header>
      <AuditTimelineView timeline={timeline} viewer={viewer} />
    </div>
  );
}

export function AuditErrorBoundary({ back }: { back: string }) {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar la auditoría"}</h1>
      <p className="mt-2 text-muted-foreground">{notFound ? "Es posible que el enlace haya cambiado." : "Revisa tu conexión y vuelve a intentarlo."}</p>
      <Link to={back} className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Volver a los proyectos
      </Link>
    </>
  );
}
