import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/result";
import { pokemonNameSchema, type PokemonName } from "../lib/validation/pokemon";

// Supabase returns at most 1000 rows per request and the Pokémon list has 1082, so we page.
const PAGE_SIZE = 1000;

/** Public names list (id, nombre_es, search_key) from the view. Use the ANON client. */
export async function listPokemonNames(db: SupabaseClient): Promise<PokemonName[]> {
  const all: PokemonName[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("pokemon_names")
      .select("id, nombre_es, search_key")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo cargar la lista de Pokémon.", {
        internal: `${error.code}: ${error.message}`,
      });
    }
    const page = z.array(pokemonNameSchema).parse(data);
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

/** Name of one Pokémon from the server-only table. Use the SERVICE client (admin screens only). */
export async function getPokemonName(db: SupabaseClient, id: number): Promise<string | null> {
  const { data, error } = await db.from("pokemon").select("nombre_es").eq("id", id).maybeSingle();
  if (error) {
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo cargar el Pokémon secreto.", {
      internal: `${error.code}: ${error.message}`,
    });
  }
  const parsed = z.object({ nombre_es: z.string() }).safeParse(data);
  return parsed.success ? parsed.data.nombre_es : null;
}
