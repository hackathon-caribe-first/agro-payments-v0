import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { LinesTable } from "~/components/split/lines-table";
import { SplitSummary } from "~/components/split/split-summary";
import { producerLines } from "~/payment-lines/module";
import type { Route } from "./+types/split.example";

export const meta = () => [{ title: "Ejemplo de reparto · Surco" }];

// The worked example of the split rules: hito 2, fertilización, EUR 1,000.00 with a 1.00 commission per payment.
export async function clientLoader() {
  const result = producerLines.getPrdExample();
  if (!result.ok) throw new Response("Ejemplo no disponible", { status: 500 });
  return result.value;
}

export default function SplitExample({ loaderData }: Route.ComponentProps) {
  const { ctx, lines, preview } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/producer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a mis proyectos
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Ejemplo del reparto de un hito</p>
        <h1 className="text-3xl text-primary">Hito 2 · Fertilización</h1>
        <p className="text-pretty text-muted-foreground">
          Presupuesto máximo de 1.000,00 EUR. Los beneficiarios reciben el monto exacto, la comisión de 1,00 EUR por pago la asume el inversor dentro del tope y los 47,00 EUR que no se ejecutan nunca salen de su billetera.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <SplitSummary ctx={ctx} preview={preview} />
        </aside>
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <LinesTable ctx={ctx} lines={lines} preview={preview} />
        </div>
      </div>
    </div>
  );
}
