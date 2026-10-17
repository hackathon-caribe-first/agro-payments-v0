import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";

// Form-level (non-field) rejection, announced to assistive tech.
export function FormError({ errors }: { errors: FieldErrors }) {
  const messages = errors[FORM_LEVEL_KEY];
  if (!messages?.length) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{[...new Set(messages)].join(" ")}</AlertDescription>
    </Alert>
  );
}
