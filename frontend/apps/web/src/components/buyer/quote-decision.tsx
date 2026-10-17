import { Check, X } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import type { PresaleActionData } from "~/components/presale/error-copy";

// Accept or reject the latest sent revision. No counter-offer and no payment action exists in this flow.
export function QuoteDecision({ revision, actionData }: { revision: number; actionData?: PresaleActionData }) {
  const pending = useNavigation().state !== "idle";
  const error = actionData?.fieldErrors[FORM_LEVEL_KEY]?.join(" ");
  return (
    <Form method="post" className="flex flex-col gap-3">
      <input type="hidden" name="revision" value={revision} />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="intent" value="accept" size="compact" disabled={pending}>
          <Check aria-hidden="true" />
          Aceptar cotización
        </Button>
        <Button type="submit" name="intent" value="reject" variant="outline" size="compact" disabled={pending}>
          <X aria-hidden="true" />
          Rechazar
        </Button>
      </div>
    </Form>
  );
}
