import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/result";
import {
  DEFAULT_CLUE_INTERVAL_SECONDS,
  DEFAULT_CLUE_MAX,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_TURN_SECONDS,
  DEFAULT_WAIT_MINUTES,
} from "../lib/validation/rooms";
import type { Clue } from "../lib/feed-types";
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
  phase: z.enum(["waiting", "playing", "paused"]).default("playing"),
  start_deadline_at: z.string().nullable().optional(),
  mode: z.enum(["free", "turns"]).default("free"),
  turn_order: z.enum(["random", "arrival"]).default("random"),
  turn_seconds: z.number().int().default(20),
  clue_interval_seconds: z.number().int().default(60),
  clue_max: z.number().int().default(2),
  clues_revealed: z.number().int().default(0),
  round_no: z.number().int().default(1),
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
  /** "waiting" = lobby, "playing" = attempts accepted, "paused" = the admin paused the game. Not the same as status (open/closed). */
  phase: "waiting" | "playing" | "paused";
  /** UTC instant when a waiting room starts by itself (null when the room was created without a lobby). */
  startDeadlineAt: string | null;
  /** free = everybody sends at once; turns = one player at a time (Mode A). Chosen when the room is created. */
  mode: "free" | "turns";
  /** Turn queue order: random (assigned on entry) or arrival. Only used in turn mode. */
  turnOrder: "random" | "arrival";
  /** Seconds a player has to answer in turn mode before the turn is skipped. */
  turnSeconds: number;
  /** Automatic clues: seconds between clues, the most clues the room reveals (0 = off) and how many are out already. */
  clueIntervalSeconds: number;
  clueMax: number;
  cluesRevealed: number;
  /** Starts at 1, +1 on every reset (change secret and restart). */
  roundNo: number;
};

export type CreateRoomOptions = {
  /** Seconds between attempts of one player (1 to 120). */
  cooldownSeconds?: number;
  /** Minutes of waiting room before the game starts by itself. 0 = no waiting room. */
  waitMinutes?: number;
  /** "free" (default) or "turns". */
  mode?: "free" | "turns";
  /** Queue order in turn mode (default random). */
  turnOrder?: "random" | "arrival";
  /** Seconds per turn (5 to 120, default 20). */
  turnSeconds?: number;
  /** Seconds between automatic clues (15 to 300, default 60). */
  clueIntervalSeconds?: number;
  /** Most automatic clues (0 to 5, default 2; 0 = off). */
  clueMax?: number;
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
  const mode = options.mode ?? "free";
  const turnOrder = options.turnOrder ?? "random";
  const turnSeconds = options.turnSeconds ?? DEFAULT_TURN_SECONDS;
  const clueIntervalSeconds = options.clueIntervalSeconds ?? DEFAULT_CLUE_INTERVAL_SECONDS;
  const clueMax = options.clueMax ?? DEFAULT_CLUE_MAX;
  const waiting = waitMinutes > 0;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const roomCode = generateRoomCode();
    const adminCode = generateAdminCode();
    const { error } = await db.from("rooms").insert({
      room_code: roomCode,
      admin_code_hash: hashAdminCode(roomCode, adminCode),
      secret_pokemon_id: pokemonId,
      attempt_cooldown_seconds: cooldownSeconds,
      mode,
      turn_order: turnOrder,
      turn_seconds: turnSeconds,
      clue_interval_seconds: clueIntervalSeconds,
      clue_max: clueMax,
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
      "id, room_code, admin_code_hash, secret_pokemon_id, status, created_at, finished_at, attempt_cooldown_seconds, phase, start_deadline_at, mode, turn_order, turn_seconds, clue_interval_seconds, clue_max, clues_revealed, round_no",
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
    mode: row.mode,
    turnOrder: row.turn_order,
    turnSeconds: row.turn_seconds,
    clueIntervalSeconds: row.clue_interval_seconds,
    clueMax: row.clue_max,
    cluesRevealed: row.clues_revealed,
    roundNo: row.round_no,
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
  o_phase: z.enum(["waiting", "playing", "paused"]),
  o_start_deadline_at: z.string().nullable(),
  o_server_now: z.string(),
  // Turn mode only. Absent in answers from the pre-step-11 function.
  o_turn_nickname: z.string().nullable().optional(),
  o_turn_deadline_at: z.string().nullable().optional(),
  // Phase 3: clues already revealed, in order. Absent in answers from the pre-phase-3 function.
  o_clues: z.array(z.object({ kind: z.enum(["type", "generation"]), value: z.string() })).optional(),
});

export type DueTimers = {
  phase: "waiting" | "playing" | "paused";
  startDeadlineAt: string | null;
  /** Database clock at the moment of the read. */
  serverNow: string;
  /** Turn mode, game running: who has the turn and until when (UTC). Null otherwise. */
  turnNickname: string | null;
  turnDeadlineAt: string | null;
  /** Automatic clues revealed so far, oldest first. */
  clues: Clue[];
};

/**
 * Applies every due timer of a room (start of the waiting room, turn changes in turn mode). The database does it
 * ONCE under a room lock, even if 100 players ask at the same time, and returns the room phase, the turn holder and
 * the database clock, used for the countdowns on the phones.
 * Returns null when the room is unknown or closed.
 */
export async function applyDueTimers(
  db: SupabaseClient,
  roomId: string,
): Promise<DueTimers | null> {
  const { data, error } = await db.rpc("apply_due_timers", { p_room_id: roomId });
  if (error || !Array.isArray(data)) {
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo cargar la sala. Intenta de nuevo.", {
      internal: error ? `${error.code}: ${error.message}` : "unexpected apply_due_timers response",
    });
  }
  if (data.length === 0) return null;
  const row = timersRowSchema.parse(data[0]);
  return {
    phase: row.o_phase,
    startDeadlineAt: row.o_start_deadline_at,
    serverNow: row.o_server_now,
    turnNickname: row.o_turn_nickname ?? null,
    turnDeadlineAt: row.o_turn_deadline_at ?? null,
    clues: row.o_clues ?? [],
  };
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

function unavailableRoom(message: string, error: { code: string; message: string } | null, what: string): AppError {
  return new AppError("EXTERNAL_SERVICE_UNAVAILABLE", message, {
    internal: error ? `${error.code}: ${error.message}` : `unexpected ${what} response`,
  });
}

/** Pauses a running game (attempts, turns and clues stop; the chat keeps working). */
export async function pauseRoom(db: SupabaseClient, roomId: string): Promise<void> {
  const { data, error } = await db.rpc("pause_room", { p_room_id: roomId });
  if (error || typeof data !== "string") throw unavailableRoom("No se pudo pausar la partida. Intenta de nuevo.", error, "pause_room");
  if (data === "room_closed") throw new AppError("ROOM_CLOSED", "Esta sala ya cerró.");
  if (data === "not_playing") throw new AppError("CONFLICT", "Solo se puede pausar una partida que está en juego.");
  // already_paused is fine: the second tap changes nothing.
}

/** Resumes a paused game; the running turn and the next clue get back the time they had left. */
export async function resumeRoom(db: SupabaseClient, roomId: string): Promise<void> {
  const { data, error } = await db.rpc("resume_room", { p_room_id: roomId });
  if (error || typeof data !== "string") throw unavailableRoom("No se pudo reanudar la partida. Intenta de nuevo.", error, "resume_room");
  if (data === "room_closed") throw new AppError("ROOM_CLOSED", "Esta sala ya cerró.");
  // not_paused is fine: it was already running.
}

/** Skips the turn of the player who holds it (turn mode, game running). */
export async function skipTurn(db: SupabaseClient, roomId: string): Promise<void> {
  const { data, error } = await db.rpc("skip_turn", { p_room_id: roomId });
  if (error || typeof data !== "string") throw unavailableRoom("No se pudo saltar el turno. Intenta de nuevo.", error, "skip_turn");
  if (data === "room_closed") throw new AppError("ROOM_CLOSED", "Esta sala ya cerró.");
  if (data === "not_available") throw new AppError("CONFLICT", "Solo se puede saltar el turno en una partida por turnos que está en juego.");
}

/** Changes the automatic clue settings. Out-of-range values come back as VALIDATION_ERROR. */
export async function setClueSettings(db: SupabaseClient, roomId: string, intervalSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await db.rpc("set_clue_settings", { p_room_id: roomId, p_interval_seconds: intervalSeconds, p_max: max });
  if (error?.code === "23514") throw new AppError("VALIDATION_ERROR", "Las pistas deben ser de 0 a 5, cada 15 a 300 segundos.");
  if (error || typeof data !== "boolean") throw unavailableRoom("No se pudieron guardar las pistas. Intenta de nuevo.", error, "set_clue_settings");
  return data;
}

/** Changes the secret and restarts the round: attempts, chat and clues are erased, players are kept. */
export async function resetRoom(db: SupabaseClient, roomId: string, pokemonId: number): Promise<void> {
  const { data, error } = await db.rpc("reset_room", { p_room_id: roomId, p_pokemon_id: pokemonId });
  if (error || typeof data !== "string") throw unavailableRoom("No se pudo reiniciar la sala. Intenta de nuevo.", error, "reset_room");
  if (data === "room_closed") throw new AppError("ROOM_CLOSED", "Esta sala ya cerró.");
  if (data === "unknown_pokemon") throw new AppError("VALIDATION_ERROR", "Ese Pokémon no existe. Elige otro.");
}
