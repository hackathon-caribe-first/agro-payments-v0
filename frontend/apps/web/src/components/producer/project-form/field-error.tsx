export const errorId = (fieldId: string) => `${fieldId}-error`;

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={errorId(id)} role="alert" className="text-sm font-semibold text-destructive">
      ✕ {[...new Set(messages)].join(" ")}
    </p>
  );
}

// Shared aria wiring for an input whose errors are rendered by <FieldError id={id} />.
export const invalidProps = (id: string, messages?: string[]) =>
  messages?.length ? { "aria-invalid": true as const, "aria-describedby": errorId(id) } : {};
