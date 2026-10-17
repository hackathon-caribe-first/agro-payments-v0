import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@agro/shared/ui/button";
import { FieldError } from "./field-error";
import { MilestoneRow, type MilestoneRowValue } from "./milestone-row";

// A counter works in every context (crypto.randomUUID is unavailable over plain http on a LAN address).
let rowCounter = 0;
const nextRowKey = () => `row-${++rowCounter}`;

export const createEmptyRow = (): MilestoneRowValue => ({
  key: nextRowKey(),
  title: "",
  description: "",
  estimatedCompletionDate: "",
  suppliesBudget: "",
  laborBudget: "",
});

type FocusTarget = { kind: "move"; key: string; direction: -1 | 1 } | { kind: "element"; id: string };

type Props = {
  rows: MilestoneRowValue[];
  errors: Record<string, string[]>;
  onRowsChange: (rows: MilestoneRowValue[]) => void;
  // Row positions shift on structural changes, so positional errors are no longer reliable.
  onStructureChange: () => void;
  onFieldEdit: (index: number, field: string) => void;
};

const titleId = (key: string) => `m-${key}-title`;

// Controlled list: add, edit, remove and reorder rows. Rows keep a stable client key while their position changes.
export function MilestoneEditorList({ rows, errors, onRowsChange, onStructureChange, onFieldEdit }: Props) {
  const [announcement, setAnnouncement] = useState({ id: 0, text: "" });
  const pendingFocus = useRef<FocusTarget | null>(null);

  // Remounting the live region (new key) makes screen readers announce repeated texts again.
  const announce = (text: string) => setAnnouncement((prev) => ({ id: prev.id + 1, text }));

  // Keyboard focus must survive structural changes: it is restored once the new rows are rendered.
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;

    if (pending.kind === "element") {
      document.getElementById(pending.id)?.focus();
      return;
    }
    const preferred = document.getElementById(`move-${pending.direction === -1 ? "up" : "down"}-${pending.key}`);
    const fallback = document.getElementById(`move-${pending.direction === -1 ? "down" : "up"}-${pending.key}`);
    ((preferred as HTMLButtonElement | null)?.disabled ? fallback : preferred)?.focus();
  }, [rows]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    pendingFocus.current = { kind: "move", key: rows[index].key, direction };
    announce(`Hito movido a la posición ${target + 1} de ${rows.length}`);
    onStructureChange();
    onRowsChange(next);
  }

  function remove(index: number) {
    if (rows.length <= 1) return;
    const neighbor = rows[index - 1] ?? rows[index + 1];
    pendingFocus.current = { kind: "element", id: titleId(neighbor.key) };
    announce(`Hito ${index + 1} eliminado. Quedan ${rows.length - 1} hitos.`);
    onStructureChange();
    onRowsChange(rows.filter((_, i) => i !== index));
  }

  function add() {
    const row = createEmptyRow();
    pendingFocus.current = { kind: "element", id: titleId(row.key) };
    announce(`Hito ${rows.length + 1} agregado. Hay ${rows.length + 1} hitos.`);
    onStructureChange();
    onRowsChange([...rows, row]);
  }

  return (
    <section aria-labelledby="milestones-editor-heading" className="flex flex-col gap-4">
      <h2 id="milestones-editor-heading" className="text-lg text-primary">
        Hitos y cotización
      </h2>
      <FieldError id="milestones-editor" messages={errors.milestones} />
      <ol className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <MilestoneRow
            key={row.key}
            row={row}
            index={index}
            count={rows.length}
            errors={errors}
            onChange={(patch, field) => {
              onFieldEdit(index, field);
              onRowsChange(rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r)));
            }}
            onMove={(direction) => move(index, direction)}
            onRemove={() => remove(index)}
          />
        ))}
      </ol>
      <Button type="button" variant="outline" size="compact" onClick={add} className="self-start">
        <Plus aria-hidden="true" /> Agregar hito
      </Button>
      <p key={announcement.id} aria-live="polite" className="sr-only">
        {announcement.text}
      </p>
    </section>
  );
}
