"use server";

import { cookies, headers } from "next/headers";
import { clientIdentifier, enforceRateLimit } from "../../lib/rate-limit";
import { fail, ok, toFailure, type Result } from "../../lib/result";
import { adminCookieName, normalizeCode } from "../../lib/room-codes";
import { verifyAdminCode } from "../../lib/room-secrets";
import { createServiceClient } from "../../lib/supabase/server";
import { closeRoomInputSchema, createRoomInputSchema, loginAdminInputSchema } from "../../lib/validation/rooms";
import { closeRoom, createRoom, findRoom, verifyAdmin } from "../../services/rooms.service";

// Rate limits (documented in docs/CONTRACTS.md). Counted per caller, hashed.
const CREATE_ROOM_LIMIT = 10; // per hour
const CREATE_ROOM_WINDOW_SECONDS = 3600;
const ADMIN_LOGIN_LIMIT = 10; // per 10 minutes
const ADMIN_LOGIN_WINDOW_SECONDS = 600;
const ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;

function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE_SECONDS,
  };
}

/** Creates a room and makes this browser its admin. The admin code is returned once. */
export async function createRoomAction(input: unknown): Promise<Result<{ roomCode: string; adminCode: string }>> {
  const requestId = crypto.randomUUID();
  try {
    const parsed = createRoomInputSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Elige un Pokémon válido.");

    const db = createServiceClient();
    const caller = clientIdentifier(await headers());
    await enforceRateLimit(db, `create_room:${caller}`, CREATE_ROOM_LIMIT, CREATE_ROOM_WINDOW_SECONDS);

    const { roomCode, adminCode } = await createRoom(db, parsed.data.pokemonId);
    (await cookies()).set(adminCookieName(roomCode), adminCode, adminCookieOptions());
    return ok({ roomCode, adminCode });
  } catch (err) {
    return toFailure(err, requestId);
  }
}

/** Checks the admin code for a room and, if correct, remembers it in a protected cookie. */
export async function loginAdminAction(input: unknown): Promise<Result<{ roomCode: string }>> {
  const requestId = crypto.randomUUID();
  try {
    const parsed = loginAdminInputSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Revisa el código: tiene 12 letras y números.");
    const { roomCode, adminCode } = parsed.data;

    const db = createServiceClient();
    const caller = clientIdentifier(await headers());
    await enforceRateLimit(db, `admin_login:${caller}`, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_SECONDS);

    if (!(await verifyAdmin(db, roomCode, adminCode))) {
      return fail("FORBIDDEN", "Código incorrecto o sala cerrada.");
    }
    (await cookies()).set(adminCookieName(roomCode), adminCode, adminCookieOptions());
    return ok({ roomCode });
  } catch (err) {
    return toFailure(err, requestId);
  }
}

/**
 * The admin closes the room: the link stops working and attempts and nicknames are erased.
 * Re-checks the admin cookie on the server. No rate limit of its own: it needs the secret admin cookie
 * and closing twice is harmless (the second call answers ROOM_CLOSED).
 */
export async function closeRoomAction(input: unknown): Promise<Result<{ closed: true }>> {
  const requestId = crypto.randomUUID();
  try {
    const parsed = closeRoomInputSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Código de sala inválido.");
    const { roomCode } = parsed.data;

    const adminCookie = (await cookies()).get(adminCookieName(roomCode))?.value;
    if (adminCookie === undefined) return fail("FORBIDDEN", "Solo el administrador puede cerrar la sala.");

    const db = createServiceClient();
    const room = await findRoom(db, roomCode);
    if (!room) return fail("NOT_FOUND", "Esta sala no existe.");
    if (!verifyAdminCode(roomCode, normalizeCode(adminCookie), room.adminCodeHash)) {
      return fail("FORBIDDEN", "Solo el administrador puede cerrar la sala.");
    }
    if (room.status !== "open") return fail("ROOM_CLOSED", "Esta sala ya cerró.");

    if (!(await closeRoom(db, room.id))) return fail("ROOM_CLOSED", "Esta sala ya cerró.");
    (await cookies()).delete(adminCookieName(roomCode));
    return ok({ closed: true });
  } catch (err) {
    return toFailure(err, requestId);
  }
}
