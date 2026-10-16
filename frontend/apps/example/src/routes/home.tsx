import { Button } from "@agro/shared/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="font-brand text-3xl font-black tracking-[-0.035em] text-primary md:text-4xl">SURCO.</p>
      <h1 className="text-3xl text-primary md:text-4xl">Financiación por hitos para el campo</h1>
      <p className="max-w-md text-muted-foreground">Planea, verifica y distribuye pagos de tu cultivo.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button>Ver siguiente hito</Button>
        <Button variant="outline">Plan financiero</Button>
      </div>
      <p className="rounded-sm bg-warning px-3 py-1 text-sm font-semibold text-warning-foreground">
        ⚠ Entorno de simulación · Sin dinero real
      </p>
    </main>
  );
}
