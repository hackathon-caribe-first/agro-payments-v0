import type { Actor } from "@agro/shared/modules/presales/domain/presale";

type Viewer = "BUYER" | "PRODUCER";

// Announces turn changes politely (aria-live) after an action revalidates the page.
export function TurnIndicator({ turn, viewer, counterpart }: { turn: Actor | null; viewer: Viewer; counterpart: string }) {
  const text = turn === null ? null : turn === viewer ? "Es tu turno" : `Esperando respuesta de ${counterpart || "la otra parte"}`;
  return (
    <p aria-live="polite" className={text ? "inline-flex items-center gap-1.5 text-sm font-semibold text-primary" : "sr-only"}>
      {text ?? "La negociación terminó"}
    </p>
  );
}

// Short label for lists, where a live region per row would be noisy.
export function turnLabel(turn: Actor | null, viewer: Viewer): string | null {
  if (turn === null) return null;
  return turn === viewer ? "Tu turno" : "Esperando respuesta";
}
