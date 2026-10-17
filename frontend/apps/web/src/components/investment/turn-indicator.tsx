import type { Actor, Party } from "@agro/shared/modules/investments/domain/investment";

// Announces turn changes politely (aria-live) after an action revalidates the page.
export function TurnIndicator({ turn, viewer, counterpart }: { turn: Actor | null; viewer: Party; counterpart: string }) {
  const text = turn === null ? null : turn === viewer ? "Es tu turno" : `Esperando respuesta de ${counterpart || "la otra parte"}`;
  return (
    <p aria-live="polite" className={text ? "inline-flex items-center gap-1.5 text-sm font-semibold text-primary" : "sr-only"}>
      {text ?? "La propuesta terminó"}
    </p>
  );
}

// Short label for lists, where a live region per row would be noisy.
export function turnLabel(turn: Actor | null, viewer: Party): string | null {
  if (turn === null) return null;
  return turn === viewer ? "Tu turno" : "Esperando respuesta";
}
