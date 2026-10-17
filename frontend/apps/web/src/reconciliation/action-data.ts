import type { FieldErrors } from "@agro/shared/modules/milestones/domain/errors";

// Result of the "Conciliar" action: done, or the field errors to show next to the note.
export type ReconcileActionData = { ok: true } | { ok: false; fieldErrors: FieldErrors };
