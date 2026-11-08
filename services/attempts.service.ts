import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { FeedAttempt, HintEntry, HintResult } from "../lib/feed-types";
import { AppError } from "../lib/result";

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
    "not_started",
    "unknown_pokemon",
    "cooldown",
  ]),
  o_result: z.enum(["fire", "warm", "cold"]).nullable(),
  o_is_winner: z.boolean().nullable(),
  // Seconds left to wait; only present with "cooldown". Absent in answers from the pre-step-9 function.
  o_retry_after: z.number().int().nullable().optional(),
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
 * decides the single winner under a room lock and applies the wait between attempts chosen by the admin.
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
    case "not_started":
      throw new AppError("ROOM_NOT_STARTED", "La partida todavía no empieza. Espera en la sala.");
    case "unknown_pokemon":
      throw new AppError("VALIDATION_ERROR", "Ese Pokémon no existe. Elige uno de la lista.");
    case "cooldown": {
      const retryAfter = Math.max(1, row.o_retry_after ?? 1);
      throw new AppError("RATE_LIMITED", `Espera ${retryAfter} s para enviar otro intento.`, {
        details: { retryAfter },
      });
    }
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

/** True when somebody in the room already sent this Pokémon (courtesy check for the repeat warning). */
export async function wasTried(db: SupabaseClient, roomId: string, pokemonId: number): Promise<boolean> {
  const { data, error } = await db.rpc("was_tried", { p_room_id: roomId, p_pokemon_id: pokemonId });
  if (error || typeof data !== "boolean") {
    throw unavailable("No se pudo revisar tu intento. Intenta de nuevo.", error ? `${error.code}: ${error.message}` : "unexpected was_tried response");
  }
  return data;
}

const hintRowSchema = z.object({ o_pokemon: z.string(), o_result: z.enum(["fire", "warm"]) });

/** Side table: every Pokémon tried in the room that was not cold. Names and icon names only. */
export async function listHints(db: SupabaseClient, roomId: string): Promise<HintEntry[]> {
  const { data, error } = await db.rpc("list_hints", { p_room_id: roomId });
  if (error) throw unavailable("No se pudo cargar la partida. Intenta de nuevo.", `${error.code}: ${error.message}`);
  return z
    .array(hintRowSchema)
    .parse(data ?? [])
    .map((row) => ({ pokemon: row.o_pokemon, result: row.o_result }));
}
