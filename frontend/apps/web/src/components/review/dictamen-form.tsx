import { FileSignature, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { currentFieldData } from "@agro/shared/modules/milestones/domain/milestone-rules";
import { DICTAMEN_VERDICTS, type CriterionEvaluation, type DictamenVerdict, type ReviewDetail } from "@agro/shared/modules/reviews/domain/review";
import { draftEvaluation } from "@agro/shared/modules/reviews/domain/review-rules";
import { signDictamen } from "@agro/shared/modules/reviews/domain/signature";
import { COMMENTS_MAX_LENGTH, dictamenInputSchema, toFieldErrors } from "@agro/shared/modules/reviews/schemas/dictamen";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@agro/shared/ui/alert-dialog";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Checkbox } from "@agro/shared/ui/checkbox";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { Textarea } from "@agro/shared/ui/textarea";
import { FieldError, invalidProps } from "~/components/producer/project-form/field-error";
import type { ReviewActionData } from "~/reviews/error-copy";

const VERDICT_COPY: Record<DictamenVerdict, { label: string; hint: string }> = {
  APPROVED_FAVORABLE: { label: "Aprobado", hint: "Se paga la línea del productor, se revoca el permiso de pago del hito y se solicita el del siguiente." },
  CHANGES_REQUESTED: { label: "Observado", hint: "El productor corrige y vuelve a solicitar la verificación. El permiso sigue vivo y no se paga la línea del productor." },
};

const PLACEHOLDER_HASH = "0".repeat(64);

type Props = { detail: ReviewDetail; verifierId: string };

// The dictamen: verdict, comments, per-criterion technical evaluation and (when observed) the list of subsanaciones.
// It is signed with the SHA-256 of its payload right before it is sent, after an explicit confirmation.
export function DictamenForm({ detail, verifierId }: Props) {
  const { milestone: m } = detail;
  const fetcher = useFetcher<ReviewActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useMemo(() => draftEvaluation(m.requirements, currentFieldData(m.logs)), [m.requirements, m.logs]);

  const [verdict, setVerdict] = useState<DictamenVerdict | "">("");
  const [comments, setComments] = useState("");
  const [criteria, setCriteria] = useState<CriterionEvaluation[]>(initial);
  const [subsanaciones, setSubsanaciones] = useState<string[]>([""]);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signing, setSigning] = useState(false);

  const serverErrors = fetcher.data && !fetcher.data.ok ? fetcher.data.fieldErrors : undefined;
  const errors: FieldErrors = { ...serverErrors, ...clientErrors };
  const pending = fetcher.state !== "idle" || signing;

  // After a server rejection, move focus to the first invalid control.
  useEffect(() => {
    if (!serverErrors) return;
    const frame = requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [serverErrors]);

  const allPass = criteria.every((c) => c.passed);
  const suggestion = allPass ? "Todos los criterios cumplen: lo habitual es aprobar." : "Hay criterios sin cumplir: lo habitual es observar el hito.";

  const clear = (key: string) =>
    setClientErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });

  const updateCriterion = (index: number, patch: Partial<CriterionEvaluation>) =>
    setCriteria((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const draftInput = () => ({
    verdict,
    comments,
    technicalEvaluation: criteria,
    subsanaciones: verdict === "CHANGES_REQUESTED" ? subsanaciones.map((s) => s.trim()).filter((s) => s !== "") : [],
  });

  const review = () => {
    const parsed = dictamenInputSchema.safeParse({ ...draftInput(), signatureHash: PLACEHOLDER_HASH });
    if (!parsed.success) {
      setClientErrors(toFieldErrors(parsed.error));
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setClientErrors({});
    setConfirmOpen(true);
  };

  const sign = async () => {
    const draft = draftInput();
    if (draft.verdict === "") return;
    setSigning(true);
    try {
      const signatureHash = await signDictamen({
        milestoneId: m.id,
        verifierId,
        verdict: draft.verdict,
        comments: draft.comments,
        technicalEvaluation: draft.technicalEvaluation,
        subsanaciones: draft.subsanaciones,
      });
      fetcher.submit({ intent: "dictamen", payload: JSON.stringify({ ...draft, signatureHash }) }, { method: "post" });
    } finally {
      setSigning(false);
    }
  };

  const formError = errors[FORM_LEVEL_KEY]?.join(" ");
  const criterionErrors = (index: number, key: string) => errors[`technicalEvaluation.${index}.${key}`];

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        review();
      }}
    >
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      {errors.signatureHash && (
        <Alert variant="destructive">
          <AlertDescription>{errors.signatureHash.join(" ")}</AlertDescription>
        </Alert>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-base font-semibold text-primary">Evaluación técnica por criterio</legend>
        <p className="text-sm text-muted-foreground">Precargada con la evidencia del productor. Ajusta el resultado y explica cada criterio.</p>
        {errors.technicalEvaluation && <FieldError id="technicalEvaluation" messages={errors.technicalEvaluation} />}
        <ul className="flex flex-col gap-3">
          {criteria.map((c, index) => {
            const base = `criterion-${index}`;
            const passedErrors = criterionErrors(index, "passed");
            const reasonErrors = criterionErrors(index, "reason");
            const observedErrors = criterionErrors(index, "observed");
            return (
              <li key={c.fieldKey} className="flex flex-col gap-2 rounded-md border bg-card p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`${base}-passed`}
                    checked={c.passed}
                    onCheckedChange={(checked) => {
                      updateCriterion(index, { passed: checked === true });
                      clear(`technicalEvaluation.${index}.passed`);
                    }}
                    {...invalidProps(`${base}-passed`, passedErrors)}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`${base}-passed`} className="font-semibold">
                    {c.label}: <span className="font-normal">{c.passed ? "cumple" : "no cumple"}</span>
                  </Label>
                </div>
                <FieldError id={`${base}-passed`} messages={passedErrors} />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${base}-observed`}>Valor observado</Label>
                    <Input
                      id={`${base}-observed`}
                      value={c.observed}
                      onChange={(e) => {
                        updateCriterion(index, { observed: e.target.value });
                        clear(`technicalEvaluation.${index}.observed`);
                      }}
                      {...invalidProps(`${base}-observed`, observedErrors)}
                    />
                    <FieldError id={`${base}-observed`} messages={observedErrors} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${base}-reason`}>Motivo del resultado</Label>
                    <Input
                      id={`${base}-reason`}
                      value={c.reason}
                      onChange={(e) => {
                        updateCriterion(index, { reason: e.target.value });
                        clear(`technicalEvaluation.${index}.reason`);
                      }}
                      {...invalidProps(`${base}-reason`, reasonErrors)}
                    />
                    <FieldError id={`${base}-reason`} messages={reasonErrors} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="flex flex-col gap-2" aria-describedby="verdict-hint">
        <legend className="text-base font-semibold text-primary">Dictamen</legend>
        <p id="verdict-hint" className="text-sm text-muted-foreground" aria-live="polite">
          {suggestion}
        </p>
        <div className="flex flex-wrap gap-4" role="radiogroup" aria-invalid={errors.verdict ? true : undefined} aria-describedby={errors.verdict ? "verdict-error" : undefined}>
          {DICTAMEN_VERDICTS.map((value) => (
            <label key={value} className="flex min-w-0 items-center gap-2">
              <input
                type="radio"
                name="verdict"
                value={value}
                checked={verdict === value}
                onChange={() => {
                  setVerdict(value);
                  clear("verdict");
                }}
                className="size-4 accent-primary"
              />
              <span className="font-semibold">{VERDICT_COPY[value].label}</span>
            </label>
          ))}
        </div>
        {verdict && <p className="text-sm text-muted-foreground">{VERDICT_COPY[verdict].hint}</p>}
        {errors.verdict && (
          <p id="verdict-error" role="alert" className="text-sm font-semibold text-destructive">
            ✕ {errors.verdict.join(" ")}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dictamen-comments">Comentarios del dictamen</Label>
        <Textarea
          id="dictamen-comments"
          rows={4}
          maxLength={COMMENTS_MAX_LENGTH}
          value={comments}
          onChange={(e) => {
            setComments(e.target.value);
            clear("comments");
          }}
          {...invalidProps("dictamen-comments", errors.comments)}
        />
        <FieldError id="dictamen-comments" messages={errors.comments} />
      </div>

      {verdict === "CHANGES_REQUESTED" && (
        <fieldset className="flex flex-col gap-2" aria-describedby={errors.subsanaciones ? "subsanaciones-error" : undefined}>
          <legend className="text-base font-semibold text-primary">Subsanaciones para el productor</legend>
          <p className="text-sm text-muted-foreground">Lista lo que debe corregir antes de volver a solicitar la verificación.</p>
          {errors.subsanaciones && (
            <p id="subsanaciones-error" role="alert" className="text-sm font-semibold text-destructive">
              ✕ {errors.subsanaciones.join(" ")}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {subsanaciones.map((value, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Label htmlFor={`subsanacion-${index}`} className="sr-only">
                    Subsanación {index + 1}
                  </Label>
                  <Input
                    id={`subsanacion-${index}`}
                    placeholder={`Subsanación ${index + 1}`}
                    value={value}
                    onChange={(e) => {
                      setSubsanaciones((list) => list.map((s, i) => (i === index ? e.target.value : s)));
                      clear("subsanaciones");
                    }}
                    {...invalidProps(`subsanacion-${index}`, errors[`subsanaciones.${index}`])}
                  />
                  <FieldError id={`subsanacion-${index}`} messages={errors[`subsanaciones.${index}`]} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-compact"
                  aria-label={`Quitar subsanación ${index + 1}`}
                  disabled={subsanaciones.length === 1}
                  onClick={() => setSubsanaciones((list) => list.filter((_, i) => i !== index))}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="compact" className="self-start" onClick={() => setSubsanaciones((list) => [...list, ""])}>
            <Plus aria-hidden="true" />
            Agregar subsanación
          </Button>
        </fieldset>
      )}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <FileSignature aria-hidden="true" />
        {pending ? "Firmando…" : "Firmar y emitir dictamen"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{verdict === "APPROVED_FAVORABLE" ? "¿Emitir dictamen aprobado?" : "¿Emitir dictamen observado?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {verdict === "APPROVED_FAVORABLE"
                ? "Queda firmado con tu identidad y no se puede modificar. Se activa el pago de la línea del productor."
                : "Queda firmado con tu identidad y no se puede modificar. El productor recibe la lista de subsanaciones y no se paga su línea hasta la nueva verificación."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="compact">Volver</AlertDialogCancel>
            <AlertDialogAction size="compact" onClick={() => void sign()}>
              Firmar y emitir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
