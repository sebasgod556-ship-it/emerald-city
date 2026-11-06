import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/result";
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
};

/**
 * Creates an open room. Returns the plain admin code ONCE; only its hash is stored.
 * The "max 10 open rooms" rule is enforced by a database trigger (SQLSTATE 53400).
 */
export async function createRoom(
  db: SupabaseClient,
  pokemonId: number,
): Promise<{ roomCode: string; adminCode: string }> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const roomCode = generateRoomCode();
    const adminCode = generateAdminCode();
    const { error } = await db.from("rooms").insert({
      room_code: roomCode,
      admin_code_hash: hashAdminCode(roomCode, adminCode),
      secret_pokemon_id: pokemonId,
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
    .select("id, room_code, admin_code_hash, secret_pokemon_id, status, created_at, finished_at")
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
