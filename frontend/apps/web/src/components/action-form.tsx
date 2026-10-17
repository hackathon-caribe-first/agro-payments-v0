import { useFetcher } from "react-router";
import { Button } from "@agro/shared/ui/button";
import type { ActionResult } from "~/milestones";

type Props = {
  id: string;
  intent: string;
  label: string;
  variant?: "default" | "secondary" | "outline";
  children?: React.ReactNode;
};

// A single milestone transition. While pending it says so; it never shows success before the server confirms.
export function ActionForm({ id, intent, label, variant, children }: Props) {
  const fetcher = useFetcher<ActionResult>();
  const pending = fetcher.state !== "idle";
  const error = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <fetcher.Form method="post" className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
      {children}
      <Button type="submit" size="compact" variant={variant} disabled={pending} className="self-start">
        {pending ? "Enviando…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          ✕ {error}
        </p>
      )}
    </fetcher.Form>
  );
}

export function TextField({ name, label, hint }: { name: string; label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{label}</span>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      <textarea
        name={name}
        required
        rows={3}
        className="rounded-sm border-2 border-muted-foreground bg-card px-3 py-2 focus-visible:border-ring focus-visible:outline-none"
      />
    </label>
  );
}
