import { HINT_META, type HintEntry } from "../lib/feed-types";
import { sortHints } from "../lib/feed-hints";

/** Side table of hints: every Pokémon tried in the room that was not cold. Names and icons only. */
export function HintsTable({ hints }: { hints: HintEntry[] }) {
  const sorted = sortHints(hints);
  return (
    <details open className="rounded-xl bg-ec-surface p-4">
      <summary className="cursor-pointer font-semibold">Pistas encontradas ({sorted.length})</summary>
      {sorted.length === 0 ? (
        <p className="mt-2 text-sm text-ec-muted">Aquí aparecen los Pokémon que dieron 🌡️ o 🔥.</p>
      ) : (
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Pokémon que dieron pista (tibio o fuego)</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Pista</th>
                <th scope="col">Pokémon</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((hint) => {
                const meta = HINT_META[hint.result];
                return (
                  <tr key={hint.pokemon}>
                    <td className="w-10 py-1 text-xl">
                      <span aria-hidden="true">{meta.icon}</span>
                      <span className="sr-only">{meta.label}</span>
                    </td>
                    <td className="py-1">{hint.pokemon}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
