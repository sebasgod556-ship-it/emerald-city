import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../lib/result";

/** Same number as the database trigger (players_enforce_room_rules). */
export const MAX_PLAYERS_PER_ROOM = 100;

export type PlayerSummary = { nickname: string };

/** A player as the room list shows it: away = no sign of life for a while (only tracked in turn mode). */
export type RoomPlayer = { nickname: string; away: boolean };

/** The player behind a session cookie. kicked = the admin removed them from the room. */
export type PlayerSession = { nickname: string; kicked: boolean };

/** Seconds without a sign of life before a player counts as disconnected. Same number as the database (30 s). */
export const AWAY_AFTER_SECONDS = 30;

const playerRowSchema = z.object({ nickname: z.string() });
const sessionRowSchema = z.object({ nickname: z.string(), kicked_at: z.string().nullable() });
const listRowSchema = z.object({ nickname: z.string(), last_seen_at: z.string() });

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
): Promise<PlayerSession | null> {
  const { data, error } = await db
    .from("players")
    .select("nickname, kicked_at")
    .eq("room_id", roomId)
    .eq("session_hash", sessionHash)
    .maybeSingle();
  if (error) throw unavailable(error);
  if (!data) return null;
  const row = sessionRowSchema.parse(data);
  return { nickname: row.nickname, kicked: row.kicked_at !== null };
}

/**
 * Players still in the room (kicked ones are left out), in order of arrival. Bounded by the room cap, so no
 * pagination is needed. With trackPresence (turn mode) each player says whether they look disconnected; in free
 * mode presence is not tracked, so nobody is reported away.
 */
export async function listPlayers(
  db: SupabaseClient,
  roomId: string,
  options: { trackPresence?: boolean } = {},
): Promise<RoomPlayer[]> {
  const { data, error } = await db
    .from("players")
    .select("nickname, last_seen_at")
    .eq("room_id", roomId)
    .is("kicked_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_PLAYERS_PER_ROOM);
  if (error) throw unavailable(error);
  const cutoff = Date.now() - AWAY_AFTER_SECONDS * 1000;
  return z
    .array(listRowSchema)
    .parse(data ?? [])
    .map((row) => ({
      nickname: row.nickname,
      away: options.trackPresence === true && Date.parse(row.last_seen_at) < cutoff,
    }));
}

/**
 * Presence ping: tells the database this player still has the room open. Best effort: a failure here must never
 * break the feed, so errors are swallowed (the worst case is a player marked away a little early).
 */
export async function touchPlayer(db: SupabaseClient, roomId: string, sessionHash: string): Promise<void> {
  try {
    await db.rpc("touch_player", { p_room_id: roomId, p_session_hash: sessionHash });
  } catch {
    // ignored on purpose
  }
}

/**
 * The admin kicks a player by nickname. The row stays in the database, so the nickname stays reserved and the hints
 * table does not change; the player cannot send, chat or come back from that device. True if somebody was kicked.
 */
export async function kickPlayer(db: SupabaseClient, roomId: string, nickname: string): Promise<boolean> {
  const { data, error } = await db.rpc("kick_player", { p_room_id: roomId, p_nickname: nickname });
  if (error || typeof data !== "string") {
    throw unavailable(error ?? { code: "unexpected", message: "unexpected kick_player response" });
  }
  if (data === "room_closed") throw new AppError("ROOM_CLOSED", "Esta sala ya cerró.");
  return data === "ok";
}
