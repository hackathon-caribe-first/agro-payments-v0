import { Button } from "@agro/shared/ui/button";
import { lazy, Suspense, useEffect, useState } from "react";
import { FieldScene } from "~/components/field-scene";

// three.js only loads when the 3D scene is actually shown
const FieldCanvas = lazy(() => import("~/components/field-canvas"));

function useCanRender3D() {
  const [can, setCan] = useState<boolean | null>(null);
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const webgl = !!document.createElement("canvas").getContext("webgl2");
    setCan(!reduced && webgl);
  }, []);
  return can;
}

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
  const is3D = useCanRender3D();

  return (
    <>
      {is3D && (
        <div className="fixed inset-0 -z-10" aria-hidden="true">
          <Suspense>
            <FieldCanvas />
          </Suspense>
        </div>
      )}

      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <span className="font-brand text-3xl font-black tracking-[-0.035em] text-primary">SURCO.</span>
        <a href="#como-funciona" className="font-brand font-bold text-primary underline-offset-4 hover:underline">
          Cómo funciona
        </a>
      </header>

      <main>
        <section className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-7xl flex-col px-6 pt-6 md:pt-12">
          <h1 className="animate-fade-up text-5xl leading-[0.95] font-black tracking-[-0.04em] text-primary sm:text-7xl lg:text-8xl">
            Del surco
            <br />
            al pago.
          </h1>
          <div className="mt-6 flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
            <p className="animate-fade-up max-w-md text-lg text-foreground [animation-delay:150ms]">
              Financia tu cultivo por etapas: cada avance verificado en el campo libera el siguiente desembolso.
            </p>
            <Button size="lg" asChild className="animate-fade-up [animation-delay:300ms]">
              <a href="#como-funciona">Ver cómo funciona</a>
            </Button>
          </div>
          {is3D === false && <FieldScene />}
          <p className="mx-auto mt-auto mb-6 rounded-full bg-card px-4 py-1.5 font-brand text-sm font-bold text-primary shadow-sm" aria-hidden="true">
            Desliza ↓
          </p>
        </section>

        <section id="como-funciona" className="py-24">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="reveal text-3xl text-primary md:text-5xl">Cómo funciona</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="reveal rounded-lg border bg-card p-6 shadow-sm">
                  <span className="font-brand text-sm font-black text-success tabular-nums">{s.n}</span>
                  <h3 className="mt-2 text-lg text-primary">{s.title}</h3>
                  <p className="mt-2 text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-background">
          <div className="mx-auto max-w-6xl px-6 py-20">
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
          </div>
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
