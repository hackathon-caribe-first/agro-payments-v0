import { Filter, X } from "lucide-react";
import { Form, Link } from "react-router";
import { UNITS } from "@agro/shared/modules/presales/domain/presale";
import { Button } from "@agro/shared/ui/button";
import { Label } from "@agro/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { unitText } from "~/components/presale/format";

export const ALL = "all";

interface Props {
  types: string[];
  selectedType: string | null;
  selectedUnit: string | null;
}

// GET form: the filters live in the URL (?type=&unit=) so they survive reloads and can be shared.
export function CatalogFilters({ types, selectedType, selectedUnit }: Props) {
  return (
    <Form method="get" className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-48 flex-col gap-1.5">
        <Label htmlFor="filter-open-type">Tipo de producción</Label>
        <Select name="type" defaultValue={selectedType ?? ALL}>
          <SelectTrigger id="filter-open-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-40 flex-col gap-1.5">
        <Label htmlFor="filter-open-unit">Unidad</Label>
        <Select name="unit" defaultValue={selectedUnit ?? ALL}>
          <SelectTrigger id="filter-open-unit" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {UNITS.map((u) => (
              <SelectItem key={u} value={u}>
                {unitText({ unit: u, rawUnit: u }, 2)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="compact">
        <Filter aria-hidden="true" />
        Filtrar
      </Button>
      {(selectedType || selectedUnit) && (
        <Button asChild variant="outline" size="compact">
          <Link to="/producer/open-requests">
            <X aria-hidden="true" />
            Limpiar filtros
          </Link>
        </Button>
      )}
    </Form>
  );
}
