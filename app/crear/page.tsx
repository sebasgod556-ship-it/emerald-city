import Link from "next/link";
import { CreateRoomForm } from "../../components/RoomForms";
import { toFailure } from "../../lib/result";
import { createAnonClient } from "../../lib/supabase/server";
import { btnSecondary } from "../../lib/ui";
import type { PokemonName } from "../../lib/validation/pokemon";
import { listPokemonNames } from "../../services/pokemon.service";

export const dynamic = "force-dynamic";

// PROVISIONAL screen. The Designer replaces it at the end (see docs/CONTRACTS.md).
export default async function CreateRoomPage() {
  let names: PokemonName[] | null = null;
  try {
    names = await listPokemonNames(createAnonClient());
  } catch (err) {
    toFailure(err, crypto.randomUUID()); // logs the real error server-side; the page shows a friendly message
  }

  return (
    <main className="mx-auto flex flex-1 max-w-md flex-col items-center gap-4 p-6">
      <h1 className="text-3xl font-bold text-ec-primary">Crear sala</h1>
      {names ? (
        <CreateRoomForm names={names} />
      ) : (
        <div className="flex w-full flex-col gap-3 text-center">
          <p role="alert">No se pudo cargar la lista de Pokémon. Revisa tu internet e intenta de nuevo.</p>
          <Link href="/crear" className={btnSecondary}>
            Reintentar
          </Link>
        </div>
      )}
      <Link href="/" className="text-ec-muted underline">
        Volver al inicio
      </Link>
    </main>
  );
}
