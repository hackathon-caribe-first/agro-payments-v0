import { isRouteErrorResponse, useRouteError } from "react-router";
import { LiveStatus } from "~/components/panel/live-status";
import { PaymentsFeed } from "~/components/panel/payments-feed";
import { ProjectPanel } from "~/components/panel/project-panel";
import { PanelTotalsView } from "~/components/panel/totals";
import { unwrapOps } from "~/panel/error-copy";
import { investorPanel, PANEL_REFRESH_MS } from "~/panel/module";
import type { Route } from "./+types/panel.investor";

export const meta = () => [{ title: "Panel del inversor · Surco" }];

export async function clientLoader() {
  return unwrapOps(await investorPanel.load());
}

export default function InvestorPanelPage({ loaderData }: Route.ComponentProps) {
  const { projects, feed, totals, generatedAt } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl text-primary">Panel del inversor</h1>
          <LiveStatus generatedAt={generatedAt} everyMs={PANEL_REFRESH_MS} />
        </div>
        <p className="max-w-prose text-pretty text-muted-foreground">
          Cada hito tiene un grant con tope. Aquí ves lo gastado frente al tope, cada línea pagada con su comprobante y lo que sigue en tu billetera. La
          página se actualiza sola cada 10 segundos.
        </p>
      </header>

      <PanelTotalsView totals={totals} />

      <section aria-labelledby="projects-heading" className="flex flex-col gap-3">
        <h2 id="projects-heading" className="text-xl text-primary">
          Proyectos que financias
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no financias ningún proyecto. Cuando se firme un contrato o apruebes un grant, aparece aquí.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] gap-4">
            {projects.map((project) => (
              <ProjectPanel key={project.id} project={project} />
            ))}
          </ul>
        )}
      </section>

      <PaymentsFeed feed={feed} />
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const detail = error instanceof Response ? null : isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  return (
    <>
      <h1 className="text-2xl text-primary">No pudimos cargar tu panel</h1>
      <p className="mt-2 text-muted-foreground">Revisa tu conexión y vuelve a intentarlo.</p>
      {detail && <p className="mt-2 text-sm text-destructive">{detail}</p>}
      <a href="" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </a>
    </>
  );
}
