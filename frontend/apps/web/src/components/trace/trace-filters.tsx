import { Form, Link } from "react-router";
import { STEP_LABEL, TRACE_STEPS, type TraceFilter, type TraceView } from "@agro/shared/modules/trace/domain/trace";
import { Button } from "@agro/shared/ui/button";
import { Label } from "@agro/shared/ui/label";

const SELECT_CLASS = "h-8 w-full rounded-md border bg-background px-2 text-sm";

// GET form: the filter lives in the URL, so a trace view can be shared with a colleague (tokens are never part of it).
export function TraceFilters({ view, filter }: { view: Pick<TraceView, "projects" | "milestones">; filter: TraceFilter }) {
  const milestones = filter.projectId ? view.milestones.filter((m) => m.projectId === filter.projectId) : view.milestones;
  return (
    <Form method="get" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] items-end gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trace-project">Proyecto</Label>
        <select id="trace-project" name="project" defaultValue={filter.projectId ?? ""} className={SELECT_CLASS}>
          <option value="">Todos</option>
          {view.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trace-milestone">Hito</Label>
        <select id="trace-milestone" name="milestone" defaultValue={filter.milestoneId ?? ""} className={SELECT_CLASS}>
          <option value="">Todos</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="trace-step">Paso</Label>
        <select id="trace-step" name="step" defaultValue={filter.step ?? ""} className={SELECT_CLASS}>
          <option value="">Todos</option>
          {TRACE_STEPS.map((s) => (
            <option key={s} value={s}>
              {STEP_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="compact">
          Filtrar
        </Button>
        <Button asChild variant="ghost" size="compact">
          <Link to="/ops/trace">Limpiar</Link>
        </Button>
      </div>
    </Form>
  );
}
