import { useEffect, useRef, useState } from "react";
import type { FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { PresaleActionData } from "./error-copy";

// Mirrors the server answer into local state, focuses the first invalid control and lets a form clear one field's error on edit.
export function useFieldErrors(actionData?: PresaleActionData) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (!actionData) return;
    setErrors(actionData.fieldErrors);
    const frame = requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [actionData]);

  const clear = (key: string) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });

  return { formRef, errors, clear };
}
