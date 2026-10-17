import { PRODUCTION_TYPES, productionTypeLabel, type ProductionType } from "@agro/shared/modules/projects/domain/project-draft";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Textarea } from "@agro/shared/ui/textarea";
import { FieldError, invalidProps } from "./field-error";
import { WalletField } from "./wallet-field";

export interface ProjectDetails {
  title: string;
  description: string;
  productionType: ProductionType | "";
  startDate: string;
  estimatedEndDate: string;
  // RF-01: wallet address of the producer.
  producerWallet: string;
  // RF-21: contingency fund as typed (a whole percentage, 0 to 20).
  contingencyPct: string;
}

type Props = {
  value: ProjectDetails;
  errors: Record<string, string[]>;
  onChange: (patch: Partial<ProjectDetails>) => void;
};

export function ProjectFields({ value, errors, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-title">Nombre del proyecto</Label>
        <Input
          id="project-title"
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={120}
          {...invalidProps("project-title", errors.title)}
        />
        <FieldError id="project-title" messages={errors.title} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-description">Descripción</Label>
        <Textarea
          id="project-description"
          rows={4}
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          maxLength={2000}
          {...invalidProps("project-description", errors.description)}
        />
        <FieldError id="project-description" messages={errors.description} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-production-type">Tipo de producción</Label>
        <Select value={value.productionType} onValueChange={(v) => onChange({ productionType: v as ProductionType })}>
          <SelectTrigger id="project-production-type" className="w-full" {...invalidProps("project-production-type", errors.productionType)}>
            <SelectValue placeholder="Selecciona un tipo" />
          </SelectTrigger>
          <SelectContent>
            {PRODUCTION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {productionTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id="project-production-type" messages={errors.productionType} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-start">Fecha de inicio</Label>
          <Input
            id="project-start"
            type="date"
            value={value.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
            {...invalidProps("project-start", errors.startDate)}
          />
          <FieldError id="project-start" messages={errors.startDate} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-end">Fecha estimada de finalización</Label>
          <Input
            id="project-end"
            type="date"
            value={value.estimatedEndDate}
            min={value.startDate || undefined}
            onChange={(e) => onChange({ estimatedEndDate: e.target.value })}
            {...invalidProps("project-end", errors.estimatedEndDate)}
          />
          <FieldError id="project-end" messages={errors.estimatedEndDate} />
        </div>
      </div>

      <WalletField value={value.producerWallet} errors={errors.producerWallet} onChange={(producerWallet) => onChange({ producerWallet })} />

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="project-contingency">Fondo de imprevistos (%)</Label>
        <Input
          id="project-contingency"
          inputMode="numeric"
          autoComplete="off"
          value={value.contingencyPct}
          onChange={(e) => onChange({ contingencyPct: e.target.value.replace(/[^\d.,]/g, "") })}
          {...invalidProps("project-contingency", errors.contingencyBps)}
          aria-describedby={["project-contingency-hint", errors.contingencyBps?.length ? "project-contingency-error" : null].filter(Boolean).join(" ")}
        />
        <p id="project-contingency-hint" className="text-sm text-muted-foreground">
          Entero entre 0 y 20. Se aparta dentro del presupuesto de cada hito para gastos que no se pueden prever.
        </p>
        <FieldError id="project-contingency" messages={errors.contingencyBps} />
      </div>
    </div>
  );
}
