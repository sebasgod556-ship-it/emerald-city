import { normalizeName } from "./normalize-name";

export type SearchableName = { id: number; nombre_es: string; search_key: string };

/**
 * Finds Pokémon by name, ignoring case, accents, dots, hyphens and apostrophes.
 * Names that START with the query come first, then names that merely contain it.
 * Only names are used: players never see types or generation.
 */
export function searchPokemonNames<T extends SearchableName>(names: readonly T[], query: string, limit = 8): T[] {
  const q = normalizeName(query);
  if (q === "") return [];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const name of names) {
    if (name.search_key.startsWith(q)) starts.push(name);
    else if (name.search_key.includes(q)) contains.push(name);
  }
  return [...starts, ...contains].slice(0, limit);
}
