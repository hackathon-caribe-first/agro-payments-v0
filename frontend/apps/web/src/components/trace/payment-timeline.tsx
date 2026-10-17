import { Form, Link } from "react-router";
import { paymentKindLabel, type PaymentStepsFilter, type PaymentStepsView } from "@agro/shared/modules/trace/domain/payment-steps";
import { Button } from "@agro/shared/ui/button";
import { Label } from "@agro/shared/ui/label";

const SELECT_CLASS = "h-8 w-full rounded-md border bg-background px-2 text-sm";

// GET form like the curl trace: the filter lives in the URL so a timeline can be shared with a colleague.
export function PaymentStepsFilters({ view, filter }: { view: Pick<PaymentStepsView, "projects" | "kinds">; filter: PaymentStepsFilter }) {
  return (
    <Form method="get" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] items-end gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="steps-project">Proyecto</Label>
        <select id="steps-project" name="project" defaultValue={filter.projectId ?? ""} className={SELECT_CLASS}>
          <option value="">Todos</option>
          {view.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="steps-kind">Tipo de pago</Label>
        <select id="steps-kind" name="kind" defaultValue={filter.kind ?? ""} className={SELECT_CLASS}>
          <option value="">Todos</option>
          {view.kinds.map((kind) => (
            <option key={kind} value={kind}>
              {paymentKindLabel(kind)}
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
