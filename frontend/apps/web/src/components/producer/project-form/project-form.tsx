import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Form, Link, useNavigation } from "react-router";
import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent } from "@agro/shared/ui/card";
import { DEFAULT_CONTINGENCY_BPS } from "@agro/shared/modules/projects/domain/project-draft";
import { Separator } from "@agro/shared/ui/separator";
import { parseAmount } from "./amount";
import { MilestoneEditorList, createEmptyRow } from "./milestone-editor-list";
import type { MilestoneRowValue } from "./milestone-row";
import { ProjectFields, type ProjectDetails } from "./project-fields";
import { TotalsSummary } from "./totals-summary";

export type CreateProjectActionData = { fieldErrors: FieldErrors };

const EMPTY_DETAILS: ProjectDetails = {
  title: "",
  description: "",
  productionType: "",
  startDate: "",
  estimatedEndDate: "",
  producerWalletAddress: "",
  contingencyPct: String(DEFAULT_CONTINGENCY_BPS / 100),
};

// "5" -> 500 basis points. Empty or invalid text becomes null, which the schema reports as an invalid percentage.
function percentToBps(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100 * 1000) / 1000 : null;
}

// Wire payload: numbers or null (null reaches the schema and is reported as a missing amount).
function buildPayload(details: ProjectDetails, rows: MilestoneRowValue[]) {
  const { contingencyPct, ...rest } = details;
  return {
    ...rest,
    contingencyBps: percentToBps(contingencyPct),
    productionType: details.productionType || null,
    milestones: rows.map(({ key: _key, suppliesBudget, laborBudget, ...rest }) => ({
      ...rest,
      suppliesBudget: parseAmount(suppliesBudget),
      laborBudget: parseAmount(laborBudget),
    })),
  };
}

// Maps project-level schema keys to the detail field they belong to.
const DETAIL_KEYS = ["title", "description", "productionType", "startDate", "estimatedEndDate", "producerWalletAddress"] as const;

export function ProjectForm({ actionData }: { actionData?: CreateProjectActionData }) {
  const navigation = useNavigation();
  const pending = navigation.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);

  const [details, setDetails] = useState<ProjectDetails>(EMPTY_DETAILS);
  const [rows, setRows] = useState<MilestoneRowValue[]>(() => [createEmptyRow()]);
  const [errors, setErrors] = useState<FieldErrors>({});

  // New server answer: show its errors and move focus to the first invalid field.
  useEffect(() => {
    if (!actionData) return;
    setErrors(actionData.fieldErrors);
    const frame = requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [actionData]);

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });

  const clearMilestoneErrors = () =>
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith("milestones"))));

  const payload = JSON.stringify(buildPayload(details, rows));
  const formErrors = errors[FORM_LEVEL_KEY];

  return (
    <Form method="post" ref={formRef} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" noValidate>
      <input type="hidden" name="payload" value={payload} />

      <Card className="min-w-0">
        <CardContent className="flex flex-col gap-6">
          <ProjectFields
            value={details}
            errors={errors}
            onChange={(patch) => {
              (Object.keys(patch) as (keyof ProjectDetails)[]).forEach((k) => DETAIL_KEYS.includes(k as never) && clearError(k));
              if ("contingencyPct" in patch) clearError("contingencyBps");
              clearError("estimatedEndDate");
              setDetails((d) => ({ ...d, ...patch }));
            }}
          />
          <Separator />
          <MilestoneEditorList
            rows={rows}
            errors={errors}
            onRowsChange={setRows}
            onStructureChange={clearMilestoneErrors}
            onFieldEdit={(index, field) => clearError(`milestones.${index}.${field}`)}
          />
        </CardContent>
      </Card>

      {/* Totals and actions stay in view beside the form on wide screens and stack below it on narrow ones. */}
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
        <TotalsSummary
          milestones={rows.map((r) => ({
            key: r.key,
            title: r.title,
            suppliesBudget: parseAmount(r.suppliesBudget) ?? 0,
            laborBudget: parseAmount(r.laborBudget) ?? 0,
          }))}
        />

        {formErrors?.length ? (
          <Alert variant="destructive">
            <AlertDescription>{formErrors.join(" ")}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="compact" disabled={pending}>
            <Check aria-hidden="true" />
            {pending ? "Creando…" : "Crear proyecto"}
          </Button>
          <Button asChild variant="outline" size="compact">
            <Link to="/producer">
              <X aria-hidden="true" />
              Cancelar
            </Link>
          </Button>
        </div>
      </aside>
    </Form>
  );
}
