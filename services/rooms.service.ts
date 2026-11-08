import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/result";
import { DEFAULT_COOLDOWN_SECONDS, DEFAULT_WAIT_MINUTES } from "../lib/validation/rooms";
import { generateAdminCode, generateRoomCode, hashAdminCode, verifyAdminCode } from "../lib/room-secrets";

const MAX_CODE_ATTEMPTS = 5;

const roomRowSchema = z.object({
  id: z.string(),
  room_code: z.string(),
  admin_code_hash: z.string(),
  secret_pokemon_id: z.number(),
  status: z.enum(["open", "closed"]),
  created_at: z.string(),
  finished_at: z.string().nullable().optional(),
  attempt_cooldown_seconds: z.number().int().default(1),
  phase: z.enum(["waiting", "playing"]).default("playing"),
  start_deadline_at: z.string().nullable().optional(),
});

export type Room = {
  id: string;
  roomCode: string;
  adminCodeHash: string;
  secretPokemonId: number;
  status: "open" | "closed";
  createdAt: string;
  /** Set when somebody guessed the secret. The room stays open until the admin closes it. */
  finishedAt: string | null;
  /** Seconds a player waits between two attempts (free mode), chosen by the admin. */
  attemptCooldownSeconds: number;
  /** "waiting" = lobby before the game starts, "playing" = attempts accepted. Not the same as status (open/closed). */
  phase: "waiting" | "playing";
  /** UTC instant when a waiting room starts by itself (null when the room was created without a lobby). */
  startDeadlineAt: string | null;
};

export type CreateRoomOptions = {
  /** Seconds between attempts of one player (1 to 120). */
  cooldownSeconds?: number;
  /** Minutes of waiting room before the game starts by itself. 0 = no waiting room. */
  waitMinutes?: number;
};

/**
 * Creates an open room. Returns the plain admin code ONCE; only its hash is stored.
 * The "max 10 open rooms" rule is enforced by a database trigger (SQLSTATE 53400).
 * With waitMinutes > 0 the room starts in the waiting room and begins by itself at the deadline
 * (the deadline uses this server's clock; a few hundred ms of drift against the database is accepted).
 */
export async function createRoom(
  db: SupabaseClient,
  pokemonId: number,
  options: CreateRoomOptions = {},
): Promise<{ roomCode: string; adminCode: string }> {
  const cooldownSeconds = options.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS;
  const waitMinutes = options.waitMinutes ?? DEFAULT_WAIT_MINUTES;
  const waiting = waitMinutes > 0;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const roomCode = generateRoomCode();
    const adminCode = generateAdminCode();
    const { error } = await db.from("rooms").insert({
      room_code: roomCode,
      admin_code_hash: hashAdminCode(roomCode, adminCode),
      secret_pokemon_id: pokemonId,
      attempt_cooldown_seconds: cooldownSeconds,
      phase: waiting ? "waiting" : "playing",
      start_deadline_at: waiting ? new Date(Date.now() + waitMinutes * 60_000).toISOString() : null,
    });
    if (!error) return { roomCode, adminCode };

    if (error.code === "23505") continue; // room_code already taken: try another one
    if (error.code === "23503") throw new AppError("VALIDATION_ERROR", "Ese Pokémon no existe. Elige otro.");
    if (error.code === "53400") {
      throw new AppError(
        "ROOM_LIMIT_REACHED",
        "Ya hay 10 salas abiertas. Espera a que alguna termine e intenta de nuevo.",
      );
    }
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo crear la sala. Intenta de nuevo.", {
      internal: `${error.code}: ${error.message}`,
    });
  }
  throw new AppError("INTERNAL", "No se pudo generar un código de sala. Intenta de nuevo.");
}

/** Full room row, including the admin hash. SERVER ONLY: never send this object to the browser. */
export async function findRoom(db: SupabaseClient, roomCode: string): Promise<Room | null> {
  const { data, error } = await db
    .from("rooms")
    .select(
      "id, room_code, admin_code_hash, secret_pokemon_id, status, created_at, finished_at, attempt_cooldown_seconds, phase, start_deadline_at",
    )
    .eq("room_code", roomCode)
    .maybeSingle();
  if (error) {
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo cargar la sala. Intenta de nuevo.", {
      internal: `${error.code}: ${error.message}`,
    });
  }
  if (!data) return null;
  const row = roomRowSchema.parse(data);
  return {
    id: row.id,
    roomCode: row.room_code,
    adminCodeHash: row.admin_code_hash,
    secretPokemonId: row.secret_pokemon_id,
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at ?? null,
    attemptCooldownSeconds: row.attempt_cooldown_seconds,
    phase: row.phase,
    startDeadlineAt: row.start_deadline_at ?? null,
  };
}

/** True only for an OPEN room whose admin code matches. */
export async function verifyAdmin(db: SupabaseClient, roomCode: string, adminCode: string): Promise<boolean> {
  const room = await findRoom(db, roomCode);
  if (!room || room.status !== "open") return false;
  return verifyAdminCode(roomCode, adminCode, room.adminCodeHash);
}

/**
 * Closes an open room through the database function close_room(): attempts and players (nicknames) are erased,
 * the room row stays so the link answers "not available". Returns false when the room was already closed.
 */
export async function closeRoom(db: SupabaseClient, roomId: string): Promise<boolean> {
  const { data, error } = await db.rpc("close_room", { p_room_id: roomId });
  if (error || typeof data !== "boolean") {
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo cerrar la sala. Intenta de nuevo.", {
      internal: error ? `${error.code}: ${error.message}` : "unexpected close_room response",
    });
  }
  return data;
}

const timersRowSchema = z.object({
  o_phase: z.enum(["waiting", "playing"]),
  o_start_deadline_at: z.string().nullable(),
  o_server_now: z.string(),
});

/**
 * Applies the start timer of a waiting room if it is due (the database does it ONCE, even if 100 players ask
 * at the same time) and returns the room phase with the database clock, used for the countdown on the phones.
 * Returns null when the room is unknown or closed.
 */
export async function applyDueTimers(
  db: SupabaseClient,
  roomId: string,
): Promise<{ phase: "waiting" | "playing"; startDeadlineAt: string | null; serverNow: string } | null> {
  const { data, error } = await db.rpc("apply_due_timers", { p_room_id: roomId });
  if (error || !Array.isArray(data)) {
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo cargar la sala. Intenta de nuevo.", {
      internal: error ? `${error.code}: ${error.message}` : "unexpected apply_due_timers response",
    });
  }
  if (data.length === 0) return null;
  const row = timersRowSchema.parse(data[0]);
  return { phase: row.o_phase, startDeadlineAt: row.o_start_deadline_at, serverNow: row.o_server_now };
}

/** "Start now" from the admin. True only if this call moved the room from waiting to playing. */
export async function startRoom(db: SupabaseClient, roomId: string): Promise<boolean> {
  const { data, error } = await db.rpc("start_room", { p_room_id: roomId });
  if (error || typeof data !== "boolean") {
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo empezar la partida. Intenta de nuevo.", {
      internal: error ? `${error.code}: ${error.message}` : "unexpected start_room response",
    });
  }
  return data;
}

/** The admin changes the wait between attempts. True if an open room was updated. */
export async function setAttemptCooldown(db: SupabaseClient, roomId: string, seconds: number): Promise<boolean> {
  const { data, error } = await db.rpc("set_attempt_cooldown", { p_room_id: roomId, p_seconds: seconds });
  if (error?.code === "23514") {
    throw new AppError("VALIDATION_ERROR", "La espera debe ser de 1 a 120 segundos.");
  }
  if (error || typeof data !== "boolean") {
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo guardar la espera. Intenta de nuevo.", {
      internal: error ? `${error.code}: ${error.message}` : "unexpected set_attempt_cooldown response",
    });
  }
  return data;
}
