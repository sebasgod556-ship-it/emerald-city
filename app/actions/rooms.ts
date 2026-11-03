"use server";

import { cookies, headers } from "next/headers";
import { clientIdentifier, enforceRateLimit } from "../../lib/rate-limit";
import { fail, ok, toFailure, type Result } from "../../lib/result";
import { adminCookieName } from "../../lib/room-codes";
import { createServiceClient } from "../../lib/supabase/server";
import { createRoomInputSchema, loginAdminInputSchema } from "../../lib/validation/rooms";
import { createRoom, verifyAdmin } from "../../services/rooms.service";

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
