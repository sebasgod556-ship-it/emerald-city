import { z } from "zod";

/** The 18 types, exactly as spelled in data/pokemon.json (Spanish). */
export const POKEMON_TYPES = [
  "Acero",
  "Agua",
  "Bicho",
  "Dragón",
  "Eléctrico",
  "Fantasma",
  "Fuego",
  "Hada",
  "Hielo",
  "Lucha",
  "Normal",
  "Planta",
  "Psíquico",
  "Roca",
  "Siniestro",
  "Tierra",
  "Veneno",
  "Volador",
] as const;

/** BRIEF v1.6: 1025 base entries + 57 regional forms, no Mega, no Gigamax. */
export const EXPECTED_POKEMON_COUNT = 1082;
export const EXPECTED_REGIONAL_COUNT = 57;
export const EXPECTED_BASE_COUNT = 1025;

/** BRIEF v1.6: "Basculin de Hisui queda fuera". The JSON file itself is left untouched. */
export const EXCLUDED_POKEMON_NOMBRE_EN: readonly string[] = ["basculin-white-striped"];

export const pokemonEntrySchema = z
  .object({
    id: z.number().int().min(1),
    nombre_es: z.string().trim().min(1),
    nombre_en: z.string().trim().min(1),
    tipos_es: z.array(z.enum(POKEMON_TYPES)).min(1).max(2),
    generacion: z.number().int().min(1).max(9),
    regional: z.boolean(),
  })
  .strict();

export type PokemonEntry = z.infer<typeof pokemonEntrySchema>;

/**
 * Search key used by the player search box and stored in pokemon.search_key.
 * Lowercase, accents removed, everything except a-z and 0-9 dropped.
 * Must stay equal to public.normalize_name() in the database.
 * "Nidoran♀" -> "nidoran", "Farfetch’d" -> "farfetchd", "Mr. Mime" -> "mrmime", "Ho-Oh" -> "hooh".
 */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Validates the raw JSON, drops the excluded entries and enforces the BRIEF counts.
 * Throws an Error listing every problem found.
 */
export function parsePokemonFile(raw: unknown): PokemonEntry[] {
  const parsed = z.array(pokemonEntrySchema).parse(raw);
  const entries = parsed.filter((p) => !EXCLUDED_POKEMON_NOMBRE_EN.includes(p.nombre_en));

  const problems: string[] = [];
  if (entries.length !== EXPECTED_POKEMON_COUNT) {
    problems.push(`expected ${EXPECTED_POKEMON_COUNT} entries, got ${entries.length}`);
  }

  const regional = entries.filter((p) => p.regional).length;
  if (regional !== EXPECTED_REGIONAL_COUNT) {
    problems.push(`expected ${EXPECTED_REGIONAL_COUNT} regional forms, got ${regional}`);
  }

  const seenEs = new Set<string>();
  const seenEn = new Set<string>();
  const seenBaseIds = new Set<number>();
  for (const p of entries) {
    if (seenEs.has(p.nombre_es)) problems.push(`duplicate nombre_es: ${p.nombre_es}`);
    if (seenEn.has(p.nombre_en)) problems.push(`duplicate nombre_en: ${p.nombre_en}`);
    seenEs.add(p.nombre_es);
    seenEn.add(p.nombre_en);
    if (normalizeName(p.nombre_es) === "") problems.push(`empty search key: ${p.nombre_es}`);
    if (new Set(p.tipos_es).size !== p.tipos_es.length) problems.push(`repeated type: ${p.nombre_es}`);
    if (!p.regional) {
      if (seenBaseIds.has(p.id)) problems.push(`duplicate base id: ${p.id}`);
      seenBaseIds.add(p.id);
    }
  }
  if (seenBaseIds.size !== EXPECTED_BASE_COUNT) {
    problems.push(`expected ${EXPECTED_BASE_COUNT} base entries, got ${seenBaseIds.size}`);
  }
  for (let id = 1; id <= EXPECTED_BASE_COUNT; id++) {
    if (!seenBaseIds.has(id)) problems.push(`missing base id: ${id}`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid pokemon file:\n- ${problems.join("\n- ")}`);
  }
  return entries;
}
