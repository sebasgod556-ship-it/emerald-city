"use server";

import { cookies } from "next/headers";
import type { HintResult } from "../../lib/feed-types";
import { playerSessionHash } from "../../lib/player-session";
import { fail, ok, toFailure, type Result } from "../../lib/result";
import { createServiceClient } from "../../lib/supabase/server";
import { submitAttemptInputSchema } from "../../lib/validation/attempts";
import { submitAttempt } from "../../services/attempts.service";
import { findRoom } from "../../services/rooms.service";

// No IP rate limit on purpose (see docs/CONTRACTS.md): every call needs a valid secret player cookie and the
// database enforces 1 attempt per second per player (submit_attempt).

/** A player sends a Pokémon. Returns the icon name and whether it was the winning guess. */
export async function submitAttemptAction(input: unknown): Promise<Result<{ result: HintResult; isWinner: boolean }>> {
  const requestId = crypto.randomUUID();
  try {
    const parsed = submitAttemptInputSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Elige un Pokémon de la lista.");
    const { roomCode, pokemonId } = parsed.data;

    const sessionHash = playerSessionHash(await cookies(), roomCode);
    if (sessionHash === null) return fail("UNAUTHENTICATED", "Entra a la sala con tu apodo primero.");

    const db = createServiceClient();
    const room = await findRoom(db, roomCode);
    if (!room) return fail("NOT_FOUND", "Esta sala no existe. Revisa el código.");
    if (room.status !== "open") return fail("ROOM_CLOSED", "Esta sala ya cerró.");

    return ok(await submitAttempt(db, room.id, sessionHash, pokemonId));
  } catch (err) {
    return toFailure(err, requestId);
  }
}
