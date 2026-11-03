import Link from "next/link";
import { normalizeCode } from "../../../lib/room-codes";
import { createServiceClient } from "../../../lib/supabase/server";
import { btnSecondary } from "../../../lib/ui";
import { ROOM_CODE_PATTERN } from "../../../lib/validation/rooms";
import { findRoom } from "../../../services/rooms.service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ roomCode: string }> };

// PROVISIONAL screen. Player entry (nickname) arrives in the next step.
export default async function RoomPage({ params }: Props) {
  const roomCode = normalizeCode((await params).roomCode);

  let state: "open" | "unavailable" | "error" = "unavailable";
  if (ROOM_CODE_PATTERN.test(roomCode)) {
    try {
      const room = await findRoom(createServiceClient(), roomCode);
      state = room && room.status === "open" ? "open" : "unavailable";
    } catch {
      state = "error";
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {state === "open" ? (
        <>
          <h1 className="text-3xl font-bold text-ec-primary">Sala {roomCode}</h1>
          <p className="text-ec-muted">La sala está abierta. La entrada de jugadores con apodo llega en el siguiente paso.</p>
          <Link href={`/sala/${roomCode}/admin`} className={btnSecondary}>
            Soy el administrador
          </Link>
        </>
      ) : state === "error" ? (
        <>
          <h1 className="text-3xl font-bold text-ec-primary">Sin conexión</h1>
          <p role="alert" className="text-ec-muted">
            No se pudo cargar la sala. Intenta de nuevo en un momento.
          </p>
          <Link href={`/sala/${roomCode}`} className={btnSecondary}>
            Reintentar
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-ec-primary">Sala no disponible</h1>
          <p className="text-ec-muted">Esta sala no existe o ya cerró. Revisa el código.</p>
        </>
      )}
      <Link href="/" className="text-ec-muted underline">
        Volver al inicio
      </Link>
    </main>
  );
}
