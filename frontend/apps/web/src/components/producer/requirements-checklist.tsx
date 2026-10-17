import type { ChecklistItem } from "@agro/shared/modules/milestones/domain/milestone-rules";

export function RequirementsChecklist({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="requirements-heading" className="flex flex-col gap-3">
      <h2 id="requirements-heading" className="text-lg text-primary">
        Requisitos de evidencia
      </h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Este hito no exige evidencia.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {done} de {items.length} requisitos completos
          </p>
          <ul className="flex flex-col gap-2">
            {items.map(({ requirement, done: isDone }) => (
              <li key={requirement.fieldKey} className="flex items-center gap-2">
                <span aria-hidden="true" className={isDone ? "text-success" : "text-muted-foreground"}>
                  {isDone ? "✓" : "○"}
                </span>
                <span>{requirement.label}</span>
                <span className="text-sm text-muted-foreground">({isDone ? "completo" : "pendiente"})</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
