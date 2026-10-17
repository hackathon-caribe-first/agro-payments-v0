import { Filter, X } from "lucide-react";
import { Form, Link } from "react-router";
import { productionTypeLabel } from "@agro/shared/modules/projects/domain/project-draft";
import { Button } from "@agro/shared/ui/button";
import { Label } from "@agro/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";

export const ALL_TYPES = "all";

// GET form: the filter lives in the URL (?type=), so it survives reloads and can be shared.
// Shared by the buyer catalog and the producer dashboard: `clearTo` is where "Limpiar filtro" goes and `hidden` carries
// extra query params (e.g. the active tab) through the GET submit.
export function ListingFilter({
  types,
  selected,
  clearTo = "/buyer",
  hidden,
}: {
  types: string[];
  selected: string | null;
  clearTo?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <Form method="get" className="flex flex-wrap items-end gap-3">
      {hidden && Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <div className="flex min-w-48 flex-col gap-1.5">
        <Label htmlFor="filter-type">Tipo de producción</Label>
        <Select name="type" defaultValue={selected ?? ALL_TYPES}>
          <SelectTrigger id="filter-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>Todos</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {productionTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="compact">
        <Filter aria-hidden="true" />
        Filtrar
      </Button>
      {selected && (
        <Button asChild variant="outline" size="compact">
          <Link to={clearTo}>
            <X aria-hidden="true" />
            Limpiar filtro
          </Link>
        </Button>
      )}
    </Form>
  );
}
