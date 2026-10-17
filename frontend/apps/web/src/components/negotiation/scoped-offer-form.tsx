import { Send } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import type { PresaleActionData } from "~/components/presale/error-copy";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { MilestoneTermsFields, type MilestoneTermsInitial } from "./milestone-terms-fields";
import { ProjectTermsFields, type ProjectTermsInitial } from "./project-terms-fields";

type Props =
  | { scope: "PROJECT"; intent: "start" | "counter"; initial?: ProjectTermsInitial; submitLabel: string; actionData?: PresaleActionData }
  | {
      scope: "MILESTONE";
      intent: "start" | "counter";
      initial?: MilestoneTermsInitial;
      reference: number;
      submitLabel: string;
      actionData?: PresaleActionData;
    };

// One offer form for the project negotiation, for both scopes and both the opening offer and a counter-offer.
export function ScopedOfferForm(props: Props) {
  const { formRef, errors, clear } = useFieldErrors(props.actionData);
  const pending = useNavigation().state !== "idle";
  const idPrefix = `${props.intent}-${props.scope.toLowerCase()}`;

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value={props.intent} />
      {props.scope === "PROJECT" ? (
        <ProjectTermsFields idPrefix={idPrefix} errors={errors} clear={clear} initial={props.initial} />
      ) : (
        <MilestoneTermsFields idPrefix={idPrefix} errors={errors} clear={clear} initial={props.initial} reference={props.reference} />
      )}

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <Send aria-hidden="true" />
        {pending ? "Enviando…" : props.submitLabel}
      </Button>
    </Form>
  );
}
