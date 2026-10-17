import { Send } from "lucide-react";
import { useFetcher } from "react-router";
import type { RequirementSpec } from "@agro/shared/modules/milestones/domain/milestone";
import { Button } from "@agro/shared/ui/button";
import type { ProducerActionResult } from "~/producer/error-copy";

type Props = {
  canSubmit: boolean;
  missing: string[];
  requirements: RequirementSpec[];
};

export function SubmitReviewForm({ canSubmit, missing, requirements }: Props) {
  const fetcher = useFetcher<ProducerActionResult>();
  const pending = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.message : null;
  const missingLabels = requirements.filter((r) => missing.includes(r.fieldKey)).map((r) => r.label);

  return (
    <fetcher.Form method="post" className="flex flex-col gap-3">
      <input type="hidden" name="intent" value="submit" />
      {!canSubmit && missingLabels.length > 0 && (
        <p id="submit-hint" className="text-sm text-muted-foreground">Para enviar a revisión falta: {missingLabels.join(", ")}.</p>
      )}
      <Button
        type="submit"
        size="compact"
        disabled={!canSubmit || pending}
        aria-describedby={!canSubmit && missingLabels.length > 0 ? "submit-hint" : undefined}
        className="self-start"
      >
        <Send aria-hidden="true" />
        {pending ? "Enviando…" : "Enviar a revisión"}
      </Button>
      {error && (
        <p id="submit-error" role="alert" className="text-sm font-semibold text-destructive">
          ✕ {error}
        </p>
      )}
    </fetcher.Form>
  );
}
