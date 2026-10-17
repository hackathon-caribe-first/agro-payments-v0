import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { milestoneQuotation } from "@agro/shared/modules/projects/domain/project-draft";
import { formatMoney } from "@agro/shared/modules/milestones/milestone-state";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { Textarea } from "@agro/shared/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@agro/shared/ui/tooltip";
import { parseAmount } from "./amount";
import { FieldError, invalidProps } from "./field-error";

// Budgets are kept as digit strings while typing so the field never shows NaN.
export interface MilestoneRowValue {
  key: string;
  title: string;
  description: string;
  estimatedCompletionDate: string;
  suppliesBudget: string;
  laborBudget: string;
}

type Props = {
  row: MilestoneRowValue;
  index: number;
  count: number;
  errors: Record<string, string[]>;
  onChange: (patch: Partial<MilestoneRowValue>, field: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

const digitsOnly = (value: string) => value.replace(/\D/g, "");

// Icon-only action: the label is both the accessible name and the tooltip.
function IconButton({
  id,
  label,
  disabled,
  onClick,
  children,
}: {
  id?: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button cannot show a tooltip itself, so the span carries the hover target. */}
        <span className="inline-flex">
          <Button type="button" variant="ghost" size="icon-compact" id={id} aria-label={label} disabled={disabled} onClick={onClick}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function MilestoneRow({ row, index, count, errors, onChange, onMove, onRemove }: Props) {
  const position = index + 1;
  const err = (field: string) => errors[`milestones.${index}.${field}`];
  const id = (field: string) => `m-${row.key}-${field}`;
  const quotation = milestoneQuotation({ suppliesBudget: parseAmount(row.suppliesBudget) ?? 0, laborBudget: parseAmount(row.laborBudget) ?? 0 });

  return (
    <li>
      <Card className="gap-4 py-4">
        <CardHeader className="px-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg text-primary">Hito {position}</CardTitle>
            <div className="flex items-center gap-1">
              <IconButton id={`move-up-${row.key}`} label={`Mover hito ${position} arriba`} disabled={index === 0} onClick={() => onMove(-1)}>
                <ChevronUp aria-hidden="true" />
              </IconButton>
              <IconButton id={`move-down-${row.key}`} label={`Mover hito ${position} abajo`} disabled={index === count - 1} onClick={() => onMove(1)}>
                <ChevronDown aria-hidden="true" />
              </IconButton>
              <IconButton label={`Eliminar hito ${position}`} disabled={count === 1} onClick={onRemove}>
                <Trash2 aria-hidden="true" />
              </IconButton>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-4">
          {/* Fields reflow with the card width: title/date and supplies/labor sit side by side when there is room. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={id("title")}>Nombre del hito</Label>
              <Input
                id={id("title")}
                value={row.title}
                maxLength={120}
                onChange={(e) => onChange({ title: e.target.value }, "title")}
                {...invalidProps(id("title"), err("title"))}
              />
              <FieldError id={id("title")} messages={err("title")} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={id("date")}>Fecha estimada de cumplimiento</Label>
              <Input
                id={id("date")}
                type="date"
                value={row.estimatedCompletionDate}
                onChange={(e) => onChange({ estimatedCompletionDate: e.target.value }, "estimatedCompletionDate")}
                {...invalidProps(id("date"), err("estimatedCompletionDate"))}
              />
              <FieldError id={id("date")} messages={err("estimatedCompletionDate")} />
            </div>
            <div className="col-span-full flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={id("description")}>Descripción</Label>
              <Textarea
                id={id("description")}
                rows={2}
                value={row.description}
                maxLength={1000}
                onChange={(e) => onChange({ description: e.target.value }, "description")}
                {...invalidProps(id("description"), err("description"))}
              />
              <FieldError id={id("description")} messages={err("description")} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={id("supplies")}>Insumos (COP)</Label>
              <Input
                id={id("supplies")}
                inputMode="numeric"
                autoComplete="off"
                value={row.suppliesBudget}
                onChange={(e) => onChange({ suppliesBudget: digitsOnly(e.target.value) }, "suppliesBudget")}
                {...invalidProps(id("supplies"), err("suppliesBudget"))}
              />
              <FieldError id={id("supplies")} messages={err("suppliesBudget")} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={id("labor")}>Mano de obra (COP)</Label>
              <Input
                id={id("labor")}
                inputMode="numeric"
                autoComplete="off"
                value={row.laborBudget}
                onChange={(e) => onChange({ laborBudget: digitsOnly(e.target.value) }, "laborBudget")}
                {...invalidProps(id("labor"), err("laborBudget"))}
              />
              <FieldError id={id("labor")} messages={err("laborBudget")} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Cotización del hito: <span className="font-semibold tabular-nums text-foreground">{formatMoney(quotation, "COP")}</span>
          </p>
        </CardContent>
      </Card>
    </li>
  );
}
