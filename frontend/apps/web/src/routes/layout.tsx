import { NavLink, Outlet, isRouteErrorResponse, useRouteError } from "react-router";
import { cn } from "@agro/shared/lib/utils";

const ROLES = [
  { to: "/productor", label: "Productor" },
  { to: "/verificador", label: "Verificador" },
  { to: "/custodio", label: "Operador" },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh pb-[env(safe-area-inset-bottom)]">
      <p className="bg-warning px-4 py-2 text-center text-sm font-semibold text-warning-foreground">
        ⚠ Entorno de simulación · Sin dinero real
      </p>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-brand text-2xl font-black tracking-[-0.035em] text-primary">SURCO.</span>
          <nav aria-label="Ver la demo como" className="flex gap-1">
            {ROLES.map((r) => (
              <NavLink
                key={r.to}
                to={r.to}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center rounded-md px-3 font-brand text-sm font-bold text-primary hover:bg-accent",
                    isActive && "bg-primary text-primary-foreground hover:bg-primary",
                  )
                }
              >
                {r.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      <p className="px-4 pb-8 text-center text-sm text-muted-foreground">
        El selector de rol es de demostración; no es un inicio de sesión.
      </p>
    </div>
  );
}

export default function Layout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  return (
    <Shell>
      <h1 className="text-2xl text-primary">No pudimos cargar los hitos</h1>
      <p className="mt-2 text-muted-foreground">
        Revisa que el backend de la demo esté corriendo (<code>cd backend && pnpm start:dev</code>) y vuelve a
        intentarlo.
      </p>
      {detail && <p className="mt-2 text-sm text-destructive">{detail}</p>}
      <a href="" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </a>
    </Shell>
  );
}
