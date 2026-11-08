"use server";

import { cookies } from "next/headers";
import { playerSessionHash } from "../../lib/player-session";
import { fail, ok, toFailure, type Result } from "../../lib/result";
import { adminCookieName, normalizeCode } from "../../lib/room-codes";
import { verifyAdminCode } from "../../lib/room-secrets";
import { createServiceClient } from "../../lib/supabase/server";
import { sendChatInputSchema } from "../../lib/validation/chat";
import { postAdminChatMessage, postChatMessage } from "../../services/chat.service";
import { findRoom } from "../../services/rooms.service";

// No IP rate limit on purpose (see docs/CONTRACTS.md): every call needs a secret cookie and the database
// enforces 10 messages per minute per player (30 for the admin).

/** A player, or the room's admin, writes in the conversation chat. */
export async function sendChatMessageAction(input: unknown): Promise<Result<{ id: number }>> {
  const requestId = crypto.randomUUID();
  try {
    const parsed = sendChatInputSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Escribe un mensaje de 1 a 200 caracteres.");
    const { roomCode, body } = parsed.data;

    const jar = await cookies();
    const adminCookie = jar.get(adminCookieName(roomCode))?.value;
    const sessionHash = playerSessionHash(jar, roomCode);
    if (adminCookie === undefined && sessionHash === null) {
      return fail("UNAUTHENTICATED", "Entra a la sala con tu apodo primero.");
    }

    const db = createServiceClient();
    const room = await findRoom(db, roomCode);
    if (!room) return fail("NOT_FOUND", "Esta sala no existe.");
    if (room.status !== "open") return fail("ROOM_CLOSED", "Esta sala ya cerró.");

    if (adminCookie !== undefined && verifyAdminCode(roomCode, normalizeCode(adminCookie), room.adminCodeHash)) {
      return ok({ id: await postAdminChatMessage(db, room.id, body) });
    }
    if (sessionHash === null) return fail("FORBIDDEN", "No puedes escribir en esta sala.");
    return ok({ id: await postChatMessage(db, room.id, sessionHash, body) });
  } catch (err) {
    return toFailure(err, requestId);
  }
}
