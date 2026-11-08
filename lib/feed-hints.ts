import type { FeedAttempt, HintEntry } from "./feed-types";

/** Merges hint lists by Pokémon. Fire wins over warm (it never changes in practice, but be safe). */
export function mergeHints(previous: HintEntry[], incoming: HintEntry[]): HintEntry[] {
  if (incoming.length === 0) return previous;
  const byName = new Map<string, HintEntry>();
  for (const hint of previous) byName.set(hint.pokemon, hint);
  let changed = false;
  for (const hint of incoming) {
    const known = byName.get(hint.pokemon);
    if (known === undefined || (known.result === "warm" && hint.result === "fire")) {
      byName.set(hint.pokemon, hint);
      changed = true;
    }
  }
  return changed ? [...byName.values()] : previous;
}

/** Cold attempts give no hint for the side table. */
export function hintsFromAttempts(attempts: FeedAttempt[]): HintEntry[] {
  const out: HintEntry[] = [];
  for (const a of attempts) if (a.result !== "cold") out.push({ pokemon: a.pokemon, result: a.result });
  return out;
}

/** Fire first, then warm; alphabetical (Spanish) inside each group. */
export function sortHints(hints: HintEntry[]): HintEntry[] {
  return [...hints].sort((a, b) =>
    a.result === b.result ? a.pokemon.localeCompare(b.pokemon, "es") : a.result === "fire" ? -1 : 1,
  );
}
