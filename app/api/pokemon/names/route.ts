import { NextResponse } from "next/server";
import { toFailure, HTTP_STATUS, ok } from "../../../../lib/result";
import { createAnonClient } from "../../../../lib/supabase/server";
import { listPokemonNames } from "../../../../services/pokemon.service";

// Dynamic (so the build never needs the database) but cacheable by the CDN through the header below.
export const dynamic = "force-dynamic";

/**
 * Public list of Pokémon names for the search box: id, nombre_es, search_key. NO types, NO generation.
 * It uses the anon client, which can only read the pokemon_names view. Cached for a day: names never change mid-game.
 */
export async function GET() {
  try {
    const names = await listPokemonNames(createAnonClient());
    return NextResponse.json(ok({ names }), {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    });
  } catch (err) {
    const failure = toFailure(err, crypto.randomUUID());
    const status = failure.error ? HTTP_STATUS[failure.error.code] : 500;
    return NextResponse.json(failure, { status, headers: { "Cache-Control": "no-store" } });
  }
}
