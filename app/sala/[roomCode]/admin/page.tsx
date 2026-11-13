import { cookies, headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { CloseRoomButton, CooldownControl } from "../../../../components/AdminControls";
import { GameRoom } from "../../../../components/GameRoom";
import { AdminLoginForm, CopyButton } from "../../../../components/RoomForms";
import type { FeedSnapshot } from "../../../../lib/feed-types";
import { adminCookieName, normalizeCode } from "../../../../lib/room-codes";
import { verifyAdminCode } from "../../../../lib/room-secrets";
import { createServiceClient } from "../../../../lib/supabase/server";
import { btnSecondary } from "../../../../lib/ui";
import { ROOM_CODE_PATTERN } from "../../../../lib/validation/rooms";
import { getFeed } from "../../../../services/feed.service";
import { MAX_PLAYERS_PER_ROOM } from "../../../../services/players.service";
import { getPokemonName } from "../../../../services/pokemon.service";
import { findRoom, type Room } from "../../../../services/rooms.service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ roomCode: string }> };

// PROVISIONAL screen. Admin powers (close room, kick, etc.) arrive in later steps.
export default async function AdminPage({ params }: Props) {
  const roomCode = normalizeCode((await params).roomCode);

  if (!ROOM_CODE_PATTERN.test(roomCode)) return <Unavailable />;

  let room: Room | null = null;
  let secretName: string | null = null;
  let isAdmin = false;
  let feed: FeedSnapshot | null = null;
  try {
    const db = createServiceClient();
    room = await findRoom(db, roomCode);
    if (room && room.status === "open") {
      const cookie = (await cookies()).get(adminCookieName(roomCode))?.value;
      isAdmin = cookie ? verifyAdminCode(roomCode, normalizeCode(cookie), room.adminCodeHash) : false;
      if (isAdmin) {
        secretName = await getPokemonName(db, room.secretPokemonId);
        feed = await getFeed(db, room, { after: null, chatAfter: null, full: true });
      }
    }
  } catch {
    return (
      <Shell title="Sin conexión">
        <p role="alert" className="text-ec-muted">
          No se pudo cargar la sala. Intenta de nuevo en un momento.
        </p>
        <Link href={`/sala/${roomCode}/admin`} className={btnSecondary}>
          Reintentar
        </Link>
      </Shell>
    );
  }

  if (!room || room.status !== "open") return <Unavailable />;

  if (!isAdmin) {
    return (
      <Shell title={`Sala ${roomCode}`}>
        <AdminLoginForm roomCode={roomCode} />
      </Shell>
    );
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const link = `${proto}://${host}/sala/${roomCode}`;

  return (
    <Shell title={`Sala ${roomCode}`}>
      <p className="rounded-xl bg-ec-surface p-4 text-left">
        Eres el administrador. Pokémon secreto: <strong>{secretName ?? "no disponible"}</strong>
        <br />
        <span className="text-sm text-ec-muted">No lo compartas con los jugadores.</span>
      </p>
      <section className="flex w-full flex-col gap-2 rounded-xl bg-ec-surface p-4 text-left">
        <h2 className="font-semibold">Enlace para los jugadores</h2>
        <p className="break-all text-ec-muted">{link}</p>
        <CopyButton value={link} label="Copiar enlace" />
      </section>
      {feed ? <GameRoom roomCode={roomCode} nickname={null} initial={feed} maxPlayers={MAX_PLAYERS_PER_ROOM} /> : null}
      {room.mode === "turns" ? (
        <p className="w-full rounded-xl bg-ec-surface p-4 text-left text-sm text-ec-muted">
          Modo turnos: {room.turnSeconds} s por turno, orden {room.turnOrder === "random" ? "aleatorio" : "de llegada"}.
          Si un jugador no responde, el turno pasa al siguiente. Puedes expulsar desde la lista de jugadores.
        </p>
      ) : (
        <CooldownControl roomCode={roomCode} initialSeconds={room.attemptCooldownSeconds} />
      )}
      <CloseRoomButton roomCode={roomCode} />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex flex-1 max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-bold text-ec-primary">{title}</h1>
      {children}
      <Link href="/" className="text-ec-muted underline">
        Volver al inicio
      </Link>
    </main>
  );
}

function Unavailable() {
  return (
    <Shell title="Sala no disponible">
      <p className="text-ec-muted">Esta sala no existe o ya cerró. Revisa el código.</p>
    </Shell>
  );
}
