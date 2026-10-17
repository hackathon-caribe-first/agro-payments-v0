import type { StatementView } from "@agro/shared/modules/statements/domain/statement-view";

// The statement as a clean document: brand, title, parties, tables and totals. Fluid on screen, A4 on paper.
export function StatementDocument({ view }: { view: StatementView }) {
  return (
    <article aria-labelledby="statement-title" className="statement-print flex min-w-0 flex-col gap-6 rounded-lg border bg-card p-5 md:p-8">
      <header className="flex flex-col gap-4 border-b pb-5">
        <p className="font-brand text-xl font-black tracking-[-0.035em]">SURCO.</p>
        <div>
          <h1 id="statement-title" className="text-3xl text-primary">
            {view.title}
          </h1>
          <p className="mt-1 break-words text-muted-foreground">{view.subtitle}</p>
        </div>
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-x-6 gap-y-3 text-sm">
          {view.meta.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      {view.notices.map((notice) => (
        <p key={notice} role="status" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {notice}
        </p>
      ))}

      {view.tables.map((table) => (
        <section key={table.id} aria-labelledby={`statement-${table.id}`} className="statement-section flex flex-col gap-2">
          <h2 id={`statement-${table.id}`} className="text-lg text-primary">
            {table.title}
          </h2>
          {table.note && <p className="max-w-prose text-pretty text-sm text-muted-foreground">{table.note}</p>}
          {table.rows.length === 0 ? (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{table.emptyText}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <caption className="sr-only">{table.title}</caption>
                <thead>
                  <tr className="bg-muted text-left">
                    {table.columns.map((c) => (
                      <th key={c.header} scope="col" className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}>
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i} className="border-b align-top">
                      {row.map((cell, k) => (
                        <td key={k} className={`px-3 py-2 ${table.columns[k]?.align === "right" ? "text-right tabular-nums" : "break-words"}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <section aria-labelledby="statement-totals" className="statement-section flex flex-col gap-2">
        <h2 id="statement-totals" className="text-lg text-primary">
          Totales
        </h2>
        <dl className="ml-auto flex w-full max-w-md flex-col text-sm">
          {view.totals.map((t) => (
            <div key={t.key} className="flex items-baseline justify-between gap-4 border-b py-2">
              <dt className={t.emphasis ? "font-semibold" : "text-muted-foreground"}>{t.label}</dt>
              <dd className={`text-right tabular-nums ${t.emphasis ? "text-base font-semibold text-primary" : "font-semibold"}`}>{t.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
