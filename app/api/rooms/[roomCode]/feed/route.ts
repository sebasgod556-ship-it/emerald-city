import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { playerSessionHash } from "../../../../../lib/player-session";
import { fail, HTTP_STATUS, ok, toFailure, type Result } from "../../../../../lib/result";
import { adminCookieName, normalizeCode } from "../../../../../lib/room-codes";
import { verifyAdminCode } from "../../../../../lib/room-secrets";
import { createServiceClient } from "../../../../../lib/supabase/server";
import { parseFeedQuery } from "../../../../../lib/validation/attempts";
import { roomCodeSchema } from "../../../../../lib/validation/rooms";
import { getFeed } from "../../../../../services/attempts.service";
import { findPlayerBySession } from "../../../../../services/players.service";
import { findRoom } from "../../../../../services/rooms.service";

export const dynamic = "force-dynamic";

function respond<T>(result: Result<T>) {
  const status = result.error ? HTTP_STATUS[result.error.code] : 200;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Room feed: new attempts after ?after=<id> (or the latest ones without it), the room status and,
 * with ?players=1, the nickname list. One request replaces the old players endpoint.
 * Only someone inside the room may read it: a player with a valid session cookie, or the room's admin.
 * No rate limit of its own: it needs a valid secret cookie (see docs/CONTRACTS.md, section 13).
 */
export async function GET(request: Request, context: { params: Promise<{ roomCode: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const parsedCode = roomCodeSchema.safeParse((await context.params).roomCode);
    if (!parsedCode.success) return respond(fail("VALIDATION_ERROR", "Código de sala inválido."));
    const roomCode = parsedCode.data;

    const query = parseFeedQuery(new URL(request.url).searchParams);
    if (query === null) return respond(fail("VALIDATION_ERROR", "Consulta inválida."));

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

    const isAdmin = adminCookie !== undefined && verifyAdminCode(roomCode, normalizeCode(adminCookie), room.adminCodeHash);
    const isPlayer = !isAdmin && playerHash !== null && (await findPlayerBySession(db, room.id, playerHash)) !== null;
    if (!isAdmin && !isPlayer) {
      return respond(fail("UNAUTHENTICATED", "Entra a la sala con tu apodo primero."));
    }

    return respond(ok(await getFeed(db, room, query)));
  } catch (err) {
    return respond(toFailure(err, requestId));
  }
}
