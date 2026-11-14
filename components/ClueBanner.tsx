import type { Clue } from "../lib/feed-types";

/** Automatic clues the room revealed so far. Plain text, in order; the newest one is announced politely to screen readers. */
export function ClueBanner({ clues }: { clues: Clue[] }) {
  if (clues.length === 0) return null;
  return (
    <section aria-label="Pistas de la sala" className="flex flex-col gap-2 rounded-xl border border-ec-primary bg-ec-surface p-4">
      <h2 className="font-semibold text-ec-primary">💡 Pistas</h2>
      <ol aria-live="polite" className="flex flex-col gap-1">
        {clues.map((clue, index) => (
          <li key={`${index}-${clue.kind}-${clue.value}`}>
            <span className="text-ec-muted">Pista {index + 1}: </span>
            {clue.kind === "type" ? (
              <>
                el Pokémon es de tipo <strong>{clue.value}</strong>
              </>
            ) : (
              <>
                el Pokémon es de la generación <strong>{clue.value}</strong>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
