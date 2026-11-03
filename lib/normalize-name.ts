/**
 * Search key used by the search boxes and stored in pokemon.search_key.
 * Lowercase, accents removed, everything except a-z and 0-9 dropped.
 * Must stay equal to public.normalize_name() in the database.
 * "Nidoran♀" -> "nidoran", "Farfetch’d" -> "farfetchd", "Mr. Mime" -> "mrmime", "Ho-Oh" -> "hooh".
 * Kept in its own tiny file so client components do not pull Zod into the browser bundle.
 */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
