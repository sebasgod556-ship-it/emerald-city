import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { playerSessionHash } from "../../../../../lib/player-session";
import { fail, HTTP_STATUS, ok, toFailure, type Result } from "../../../../../lib/result";
import { adminCookieName } from "../../../../../lib/room-codes";
import { verifyAdminCode } from "../../../../../lib/room-secrets";
import { createServiceClient } from "../../../../../lib/supabase/server";
import { roomCodeSchema } from "../../../../../lib/validation/rooms";
import { findPlayerBySession, listPlayers, MAX_PLAYERS_PER_ROOM } from "../../../../../services/players.service";
import { findRoom } from "../../../../../services/rooms.service";

export const dynamic = "force-dynamic";

function respond<T>(result: Result<T>) {
  const status = result.error ? HTTP_STATUS[result.error.code] : 200;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Player list for a room (nicknames only). Only someone inside the room may read it:
 * a player with a valid session cookie, or the room's admin. Everyone else gets 401.
 * No rate limit of its own: it needs a valid secret cookie, and Phase 2 replaces polling with Realtime.
 */
export async function GET(_request: Request, context: { params: Promise<{ roomCode: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const parsedCode = roomCodeSchema.safeParse((await context.params).roomCode);
    if (!parsedCode.success) return respond(fail("VALIDATION_ERROR", "Código de sala inválido."));
    const roomCode = parsedCode.data;

    // No cookie at all: answer before touching the database (also avoids revealing which rooms exist).
    const jar = await cookies();
    const playerHash = playerSessionHash(jar, roomCode);
    const adminCookie = jar.get(adminCookieName(roomCode))?.value;
    if (playerHash === null && adminCookie === undefined) {
      return respond(fail("UNAUTHENTICATED", "Entra a la sala con tu apodo primero."));
    }

    const db = createServiceClient();
    const room = await findRoom(db, roomCode);
    if (!room) return respond(fail("NOT_FOUND", "Esta sala no existe."));
    if (room.status !== "open") return respond(fail("ROOM_CLOSED", "Esta sala ya cerró."));

    const isAdmin = adminCookie !== undefined && verifyAdminCode(roomCode, adminCookie, room.adminCodeHash);
    const isPlayer =
      !isAdmin && playerHash !== null && (await findPlayerBySession(db, room.id, playerHash)) !== null;
    if (!isAdmin && !isPlayer) {
      return respond(fail("UNAUTHENTICATED", "Entra a la sala con tu apodo primero."));
    }

    const players = await listPlayers(db, room.id);
    return respond(ok({ players, count: players.length, max: MAX_PLAYERS_PER_ROOM }));
  } catch (err) {
    return respond(toFailure(err, requestId));
  }
}
