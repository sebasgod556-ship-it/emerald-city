import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/result";

/** Same number as the database trigger (players_enforce_room_rules). */
export const MAX_PLAYERS_PER_ROOM = 100;

export type PlayerSummary = { nickname: string };

const playerRowSchema = z.object({ nickname: z.string() });

type DbError = { code: string; message: string; details?: string | null };

function internalOf(error: DbError): string {
  return `${error.code}: ${error.message}`;
}

/** Maps a Postgres error from the players insert to a safe AppError. Internals are never sent out. */
function mapInsertError(error: DbError): AppError {
  const text = `${error.message} ${error.details ?? ""}`;
  switch (error.code) {
    case "23505":
      if (text.includes("nickname_key")) {
        return new AppError("NICKNAME_TAKEN", "Ese apodo ya está en uso, agrega una letra o un número.");
      }
      return new AppError("CONFLICT", "No se pudo entrar. Intenta de nuevo.", { internal: internalOf(error) });
    case "53400":
      return new AppError("ROOM_FULL", `La sala está llena (${MAX_PLAYERS_PER_ROOM} jugadores).`);
    case "P0001":
      return new AppError("ROOM_CLOSED", "Esta sala ya cerró.");
    case "23503":
      return new AppError("NOT_FOUND", "Esta sala no existe. Revisa el código.");
    case "23514":
      return new AppError("VALIDATION_ERROR", "Ese apodo no es válido. Usa letras o números.");
    default:
      return new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo entrar a la sala. Intenta de nuevo.", {
        internal: internalOf(error),
      });
  }
}

function unavailable(error: DbError): AppError {
  return new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "No se pudo cargar la sala. Intenta de nuevo.", {
    internal: internalOf(error),
  });
}

/**
 * Adds a player. The database is the source of truth for duplicates (nickname_key),
 * the 100-player cap and the open-room rule, so concurrent joins cannot slip through.
 * Only the hash of the session token is stored.
 */
export async function addPlayer(
  db: SupabaseClient,
  roomId: string,
  nickname: string,
  sessionHash: string,
): Promise<PlayerSummary> {
  const { error } = await db.from("players").insert({ room_id: roomId, nickname, session_hash: sessionHash });
  if (error) throw mapInsertError(error);
  return { nickname };
}

/** The player who owns this session in this room, or null. Used to recognise a returning device. */
export async function findPlayerBySession(
  db: SupabaseClient,
  roomId: string,
  sessionHash: string,
): Promise<PlayerSummary | null> {
  const { data, error } = await db
    .from("players")
    .select("nickname")
    .eq("room_id", roomId)
    .eq("session_hash", sessionHash)
    .maybeSingle();
  if (error) throw unavailable(error);
  if (!data) return null;
  return { nickname: playerRowSchema.parse(data).nickname };
}

/** Nicknames only, in order of arrival. Bounded by the room cap, so no pagination is needed. */
export async function listPlayers(db: SupabaseClient, roomId: string): Promise<PlayerSummary[]> {
  const { data, error } = await db
    .from("players")
    .select("nickname")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(MAX_PLAYERS_PER_ROOM);
  if (error) throw unavailable(error);
  return z.array(playerRowSchema).parse(data ?? []).map((row) => ({ nickname: row.nickname }));
}
