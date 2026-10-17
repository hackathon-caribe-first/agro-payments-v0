import { Label } from "@agro/shared/ui/label";
import { FieldError, invalidProps } from "~/components/producer/project-form/field-error";

type AriaProps = ReturnType<typeof invalidProps>;

// Label + control + linked error. The control receives aria-invalid/aria-describedby through the render prop.
export function Field({
  id,
  label,
  errors,
  hint,
  children,
}: {
  id: string;
  label: string;
  errors?: string[];
  hint?: string;
  children: (aria: AriaProps) => React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(invalidProps(id, errors))}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <FieldError id={id} messages={errors} />
    </div>
  );
}

// Digit-only inputs: strips anything else as the user types.
export const keepDigits = (event: React.FormEvent<HTMLInputElement>) => {
  event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "");
};
