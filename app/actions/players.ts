"use server";

import { cookies, headers } from "next/headers";
import { playerSessionHash } from "../../lib/player-session";
import { clientIdentifier, enforceRateLimit } from "../../lib/rate-limit";
import { fail, ok, toFailure, type Result } from "../../lib/result";
import { playerCookieName } from "../../lib/room-codes";
import { generatePlayerToken, hashPlayerToken } from "../../lib/room-secrets";
import { createServiceClient } from "../../lib/supabase/server";
import { joinRoomInputSchema } from "../../lib/validation/players";
import { addPlayer, findPlayerBySession } from "../../services/players.service";
import { findRoom } from "../../services/rooms.service";

// Rate limit (documented in docs/CONTRACTS.md). Counted per caller AND room, so one shared
// network (mobile data, a venue) is not blocked from joining a different room.
const JOIN_ROOM_LIMIT = 60; // per 10 minutes
const JOIN_ROOM_WINDOW_SECONDS = 600;
const PLAYER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

function playerCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PLAYER_COOKIE_MAX_AGE_SECONDS,
  };
}

/** Joins an open room with a nickname and remembers this browser as that player. */
export async function joinRoomAction(input: unknown): Promise<Result<{ nickname: string }>> {
  const requestId = crypto.randomUUID();
  try {
    const parsed = joinRoomInputSchema.safeParse(input);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return fail(
        "VALIDATION_ERROR",
        field === "nickname"
          ? "Tu apodo debe tener de 2 a 20 caracteres: letras, números, espacios, punto, guion o guion bajo."
          : "Revisa el código de la sala: tiene 6 letras y números.",
      );
    }
    const { roomCode, nickname } = parsed.data;

    const db = createServiceClient();
    const caller = clientIdentifier(await headers());
    await enforceRateLimit(db, `join_room:${caller}:${roomCode}`, JOIN_ROOM_LIMIT, JOIN_ROOM_WINDOW_SECONDS);

    const room = await findRoom(db, roomCode);
    if (!room) return fail("NOT_FOUND", "Esta sala no existe. Revisa el código.");
    if (room.status !== "open") return fail("ROOM_CLOSED", "Esta sala ya cerró.");

    const jar = await cookies();

    // Same device coming back: keep its original nickname instead of creating a second player.
    const existingHash = playerSessionHash(jar, roomCode);
    if (existingHash) {
      const existing = await findPlayerBySession(db, room.id, existingHash);
      if (existing) return ok(existing);
    }

    const token = generatePlayerToken();
    const player = await addPlayer(db, room.id, nickname, hashPlayerToken(roomCode, token));
    jar.set(playerCookieName(roomCode), token, playerCookieOptions());
    return ok(player);
  } catch (err) {
    return toFailure(err, requestId);
  }
}
