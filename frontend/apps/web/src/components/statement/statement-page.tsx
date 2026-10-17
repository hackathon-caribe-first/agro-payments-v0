import { ArrowLeft } from "lucide-react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import type { Statement } from "@agro/shared/modules/statements/domain/statement";
import { toStatementView } from "@agro/shared/modules/statements/domain/statement-view";
import { StatementActions } from "./statement-actions";
import { StatementDocument } from "./statement-document";

// Print rules: only the document is printed (no sidebar, no buttons), on A4 with page margins.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 16mm; }
  body * { visibility: hidden; }
  [data-slot="sidebar-container"], [data-slot="sidebar-gap"], .statement-no-print { display: none !important; }
  .statement-print, .statement-print * { visibility: visible; }
  .statement-print { position: absolute; left: 0; top: 0; width: 100%; border: 0; padding: 0; box-shadow: none; }
  .statement-section, tr { break-inside: avoid; }
}
`;

interface Back {
  to: string;
  label: string;
}

export function StatementPage({ statement, back }: { statement: Statement; back: Back }) {
  const view = toStatementView(statement);
  // The producer's final statement only exists once the project is liquidated. The investor still sees the partial position.
  const unavailable = statement.kind === "PRODUCER_FINAL" && !statement.settled;
  return (
    <div className="flex flex-col gap-6">
      <style>{PRINT_CSS}</style>
      <Link to={back.to} className="statement-no-print inline-flex items-center gap-1.5 self-start text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      {unavailable ? (
        <>
          <header>
            <p className="text-sm text-muted-foreground">{statement.project.title}</p>
            <h1 className="text-3xl text-primary">{view.title}</h1>
          </header>
          <p role="status" className="rounded-lg border bg-card p-5 text-muted-foreground">
            El estado de cuenta estará disponible cuando se liquide el proyecto.
          </p>
        </>
      ) : (
        <>
          <StatementActions statement={statement} />
          <StatementDocument view={view} />
        </>
      )}
    </div>
  );
}

export function StatementErrorBoundary({ back }: { back: Back }) {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? "No encontramos este proyecto" : "No pudimos cargar el estado de cuenta"}</h1>
      <p className="mt-2 text-muted-foreground">{notFound ? "Es posible que el enlace haya cambiado." : "Revisa tu conexión y vuelve a intentarlo."}</p>
      <Link to={back.to} className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        {back.label}
      </Link>
    </>
  );
}
