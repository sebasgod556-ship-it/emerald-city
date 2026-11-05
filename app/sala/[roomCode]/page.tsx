import { cookies } from "next/headers";
import Link from "next/link";
import { JoinNicknameForm, PlayerLobby } from "../../../components/PlayerForms";
import { playerSessionHash } from "../../../lib/player-session";
import { normalizeCode } from "../../../lib/room-codes";
import { createServiceClient } from "../../../lib/supabase/server";
import { btnSecondary } from "../../../lib/ui";
import { ROOM_CODE_PATTERN } from "../../../lib/validation/rooms";
import { findPlayerBySession, listPlayers, MAX_PLAYERS_PER_ROOM } from "../../../services/players.service";
import { findRoom } from "../../../services/rooms.service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ roomCode: string }> };

type ScreenState =
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "join" }
  | { kind: "lobby"; nickname: string; players: string[] };

// PROVISIONAL screen. The Designer replaces it at the end (see docs/CONTRACTS.md).
export default async function RoomPage({ params }: Props) {
  const roomCode = normalizeCode((await params).roomCode);

  let state: ScreenState = { kind: "unavailable" };
  if (ROOM_CODE_PATTERN.test(roomCode)) {
    try {
      const db = createServiceClient();
      const room = await findRoom(db, roomCode);
      if (room && room.status === "open") {
        const hash = playerSessionHash(await cookies(), roomCode);
        const me = hash ? await findPlayerBySession(db, room.id, hash) : null;
        if (me) {
          const players = await listPlayers(db, room.id);
          state = { kind: "lobby", nickname: me.nickname, players: players.map((p) => p.nickname) };
        } else {
          state = { kind: "join" };
        }
      }
    } catch {
      state = { kind: "error" };
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {state.kind === "join" ? (
        <>
          <h1 className="text-3xl font-bold text-ec-primary">Sala {roomCode}</h1>
          <p className="text-ec-muted">Elige un apodo para entrar.</p>
          <JoinNicknameForm roomCode={roomCode} />
        </>
      ) : state.kind === "lobby" ? (
        <PlayerLobby
          roomCode={roomCode}
          nickname={state.nickname}
          initialPlayers={state.players}
          maxPlayers={MAX_PLAYERS_PER_ROOM}
        />
      ) : state.kind === "error" ? (
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
      {state.kind === "join" || state.kind === "lobby" ? (
        <Link href={`/sala/${roomCode}/admin`} className="text-ec-muted underline">
          Soy el administrador
        </Link>
      ) : null}
      <Link href="/" className="text-ec-muted underline">
        Volver al inicio
      </Link>
    </main>
  );
}
