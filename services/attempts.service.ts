import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { FeedAttempt, FeedSnapshot, HintResult } from "../lib/feed-types";
import { AppError } from "../lib/result";
import { listPlayers } from "./players.service";

/** First load: the latest attempts only. Later polls: pages of up to FEED_PAGE_LIMIT after the cursor. */
export const FEED_INITIAL_LIMIT = 50;
export const FEED_PAGE_LIMIT = 100;

const submitRowSchema = z.object({
  o_outcome: z.enum([
    "ok",
    "unknown_room",
    "room_closed",
    "round_finished",
    "not_player",
    "unknown_pokemon",
    "cooldown",
  ]),
  o_result: z.enum(["fire", "warm", "cold"]).nullable(),
  o_is_winner: z.boolean().nullable(),
});

const feedRowSchema = z.object({
  o_id: z.number().int(),
  o_nickname: z.string(),
  o_pokemon: z.string(),
  o_result: z.enum(["fire", "warm", "cold"]),
  o_is_winner: z.boolean(),
});

function unavailable(message: string, internal: string): AppError {
  return new AppError("EXTERNAL_SERVICE_UNAVAILABLE", message, { internal });
}

/**
 * Records one attempt. The database (submit_attempt) computes the hint from types and generation,
 * decides the single winner under a room lock and applies the 1-attempt-per-second brake.
 * Only the icon name and the winner flag come back: types and generation never leave the database.
 */
export async function submitAttempt(
  db: SupabaseClient,
  roomId: string,
  sessionHash: string,
  pokemonId: number,
): Promise<{ result: HintResult; isWinner: boolean }> {
  const { data, error } = await db.rpc("submit_attempt", {
    p_room_id: roomId,
    p_session_hash: sessionHash,
    p_pokemon_id: pokemonId,
  });
  const first: unknown = Array.isArray(data) ? data[0] : undefined;
  const parsed = submitRowSchema.safeParse(first);
  if (error || !parsed.success) {
    throw unavailable(
      "No se pudo enviar tu intento. Intenta de nuevo.",
      error ? `${error.code}: ${error.message}` : "unexpected submit_attempt response",
    );
  }
  const row = parsed.data;
  switch (row.o_outcome) {
    case "ok":
      if (row.o_result === null || row.o_is_winner === null) {
        throw unavailable("No se pudo enviar tu intento. Intenta de nuevo.", "submit_attempt ok without result");
      }
      return { result: row.o_result, isWinner: row.o_is_winner };
    case "unknown_room":
      throw new AppError("NOT_FOUND", "Esta sala no existe. Revisa el código.");
    case "room_closed":
      throw new AppError("ROOM_CLOSED", "Esta sala ya cerró.");
    case "round_finished":
      throw new AppError("ROUND_FINISHED", "La partida ya terminó. Ya no se aceptan más intentos.");
    case "not_player":
      throw new AppError("UNAUTHENTICATED", "Entra a la sala con tu apodo primero.");
    case "unknown_pokemon":
      throw new AppError("VALIDATION_ERROR", "Ese Pokémon no existe. Elige uno de la lista.");
    case "cooldown":
      throw new AppError("RATE_LIMITED", "Vas muy rápido. Espera un segundo e intenta de nuevo.", {
        details: { retryAfter: 1 },
      });
  }
}

/** Attempts of a room, oldest first. after = null returns the latest FEED_INITIAL_LIMIT. */
export async function listAttempts(
  db: SupabaseClient,
  roomId: string,
  after: number | null,
): Promise<{ attempts: FeedAttempt[]; hasMore: boolean }> {
  const limit = after === null ? FEED_INITIAL_LIMIT : FEED_PAGE_LIMIT + 1;
  const { data, error } = await db.rpc("list_attempts", { p_room_id: roomId, p_after: after, p_limit: limit });
  if (error) throw unavailable("No se pudo cargar la partida. Intenta de nuevo.", `${error.code}: ${error.message}`);
  const rows = z.array(feedRowSchema).parse(data ?? []);
  const hasMore = after !== null && rows.length > FEED_PAGE_LIMIT;
  const attempts = rows.slice(0, after === null ? rows.length : FEED_PAGE_LIMIT).map((row) => ({
    id: row.o_id,
    nickname: row.o_nickname,
    pokemon: row.o_pokemon,
    result: row.o_result,
    isWinner: row.o_is_winner,
  }));
  return { attempts, hasMore };
}

/** One feed payload for the polling endpoint and the first render: attempts, status and (optionally) players. */
export async function getFeed(
  db: SupabaseClient,
  room: { id: string; finishedAt: string | null },
  options: { after: number | null; withPlayers: boolean },
): Promise<FeedSnapshot> {
  const { attempts, hasMore } = await listAttempts(db, room.id, options.after);
  const players = options.withPlayers ? (await listPlayers(db, room.id)).map((p) => p.nickname) : null;
  const last = attempts[attempts.length - 1];
  return {
    status: room.finishedAt === null ? "playing" : "finished",
    attempts,
    cursor: last ? last.id : (options.after ?? 0),
    hasMore,
    players,
  };
}
