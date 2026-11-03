import Link from "next/link";
import { JoinRoomForm } from "../components/RoomForms";
import { btnPrimary } from "../lib/ui";

// PROVISIONAL home page. The Designer replaces it at the end (see docs/CONTRACTS.md).
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {/* Reserved space for the logo (not available yet). */}
      <div aria-hidden="true" className="size-24 rounded-2xl border border-dashed border-ec-muted/50" />
      <h1 className="text-4xl font-bold text-ec-primary">Emerald City</h1>
      <p className="text-ec-muted">Adivina el Pokémon secreto con pistas de frío y calor. Versión provisional.</p>
      <div className="flex w-full flex-col gap-3">
        <Link href="/crear" className={btnPrimary}>
          Crear sala
        </Link>
        <JoinRoomForm />
      </div>
    </main>
  );
}
