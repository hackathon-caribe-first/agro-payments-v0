import { Button } from "@agro/shared/ui/button";
import { FieldScene } from "~/components/field-scene";

const STEPS = [
  { n: "01", title: "Planea el cultivo", body: "Define etapas, presupuesto y los hitos que liberan cada desembolso." },
  { n: "02", title: "Verifica cada hito", body: "El productor sube evidencia desde el campo y un verificador la aprueba o pide corrección." },
  { n: "03", title: "Distribuye los pagos", body: "Cada hito aprobado reparte el pago entre productor, proveedor y trabajadores." },
];

const SPLIT = [
  { label: "Productor", pct: 50, className: "bg-primary" },
  { label: "Proveedor", pct: 30, className: "bg-lime-deep" },
  { label: "Trabajadores", pct: 20, className: "bg-warning" },
];

export function meta() {
  return [
    { title: "Surco · Financiación por hitos para el campo" },
    { name: "description", content: "Planea, verifica y distribuye pagos de tu cultivo por hitos." },
  ];
}

export default function Landing() {
  return (
    <>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-brand text-3xl font-black tracking-[-0.035em] text-primary">SURCO.</span>
        <a href="#como-funciona" className="font-brand font-bold text-primary underline-offset-4 hover:underline">
          Cómo funciona
        </a>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pt-8 pb-16 md:grid-cols-2 md:pt-16">
          <div className="flex flex-col items-start gap-6">
            <h1 className="animate-fade-up text-4xl leading-tight text-primary md:text-5xl">
              Del surco al pago, hito por hito.
            </h1>
            <p className="animate-fade-up max-w-md text-lg text-muted-foreground [animation-delay:150ms]">
              Financia tu cultivo por etapas: cada avance verificado en el campo libera el siguiente desembolso.
            </p>
            <Button size="lg" asChild className="animate-fade-up [animation-delay:300ms]">
              <a href="#como-funciona">Ver cómo funciona</a>
            </Button>
          </div>
          <FieldScene />
        </section>

        <section id="como-funciona" className="bg-card py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="reveal text-2xl text-primary md:text-3xl">Cómo funciona</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="reveal rounded-lg border bg-background p-6">
                  <span className="font-brand text-sm font-black text-success tabular-nums">{s.n}</span>
                  <h3 className="mt-2 text-lg text-primary">{s.title}</h3>
                  <p className="mt-2 text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="reveal text-2xl text-primary md:text-3xl">Distribución por hito</h2>
          <p className="reveal mt-2 max-w-xl text-muted-foreground">
            Ejemplo de reparto de un hito aprobado. Los porcentajes se definen en el plan de cada cultivo.
          </p>
          <div className="reveal mt-8 flex h-4 overflow-hidden rounded-sm" aria-hidden="true">
            {SPLIT.map((s) => (
              <div key={s.label} className={s.className} style={{ width: `${s.pct}%` }} />
            ))}
          </div>
          <ul className="reveal mt-4 flex flex-wrap gap-x-8 gap-y-2">
            {SPLIT.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                <span className={`size-3 rounded-full ${s.className}`} aria-hidden="true" />
                <span className="font-semibold">{s.label}</span>
                <span className="text-muted-foreground tabular-nums">{s.pct} %</span>
              </li>
            ))}
          </ul>
          <p className="mt-10 inline-block rounded-sm bg-warning px-3 py-1 text-sm font-semibold text-warning-foreground">
            ⚠ Entorno de simulación · Sin dinero real
          </p>
        </section>
      </main>

      <footer className="bg-sidebar py-10 text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
          <span className="font-brand text-2xl font-black tracking-[-0.035em]">SURCO.</span>
          <p className="text-sm">Agro Payments · Demo de pagos simulados</p>
        </div>
      </footer>
    </>
  );
}
