import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ChatMessage } from "../lib/feed-types";
import { AppError } from "../lib/result";

/** First load: the latest messages only. Later polls: pages of up to CHAT_PAGE_LIMIT after the cursor. */
export const CHAT_INITIAL_LIMIT = 50;
export const CHAT_PAGE_LIMIT = 100;

const chatRowSchema = z.object({
  o_id: z.number().int(),
  o_nickname: z.string(),
  o_body: z.string(),
  o_is_admin: z.boolean(),
});

const postRowSchema = z.object({
  o_outcome: z.enum(["ok", "unknown_room", "room_closed", "not_player", "invalid", "rate_limited"]),
  o_id: z.number().int().nullable(),
});

function unavailable(message: string, internal: string): AppError {
  return new AppError("EXTERNAL_SERVICE_UNAVAILABLE", message, { internal });
}

function interpret(data: unknown, error: { code: string; message: string } | null): number {
  const parsed = postRowSchema.safeParse(Array.isArray(data) ? data[0] : undefined);
  if (error || !parsed.success) {
    throw unavailable(
      "No se pudo enviar tu mensaje. Intenta de nuevo.",
      error ? `${error.code}: ${error.message}` : "unexpected chat post response",
    );
  }
  const row = parsed.data;
  switch (row.o_outcome) {
    case "ok":
      if (row.o_id === null) throw unavailable("No se pudo enviar tu mensaje. Intenta de nuevo.", "chat ok without id");
      return row.o_id;
    case "unknown_room":
      throw new AppError("NOT_FOUND", "Esta sala no existe.");
    case "room_closed":
      throw new AppError("ROOM_CLOSED", "Esta sala ya cerró.");
    case "not_player":
      throw new AppError("UNAUTHENTICATED", "Entra a la sala con tu apodo primero.");
    case "invalid":
      throw new AppError("VALIDATION_ERROR", "Escribe un mensaje de 1 a 200 caracteres.");
    case "rate_limited":
      throw new AppError("RATE_LIMITED", "Escribes muy rápido. Espera un momento.", { details: { retryAfter: 10 } });
  }
}

/** A player writes in the chat. The database enforces 10 messages per minute per player. */
export async function postChatMessage(db: SupabaseClient, roomId: string, sessionHash: string, body: string): Promise<number> {
  const { data, error } = await db.rpc("post_chat_message", { p_room_id: roomId, p_session_hash: sessionHash, p_body: body });
  return interpret(data, error);
}

/** The room's admin writes in the chat. The caller has already verified the admin code. */
export async function postAdminChatMessage(db: SupabaseClient, roomId: string, body: string): Promise<number> {
  const { data, error } = await db.rpc("post_admin_chat_message", { p_room_id: roomId, p_body: body });
  return interpret(data, error);
}

/** Chat of a room, oldest first. after = null returns the latest CHAT_INITIAL_LIMIT. */
export async function listChat(
  db: SupabaseClient,
  roomId: string,
  after: number | null,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = after === null ? CHAT_INITIAL_LIMIT : CHAT_PAGE_LIMIT + 1;
  const { data, error } = await db.rpc("list_chat", { p_room_id: roomId, p_after: after, p_limit: limit });
  if (error) throw unavailable("No se pudo cargar el chat. Intenta de nuevo.", `${error.code}: ${error.message}`);
  const rows = z.array(chatRowSchema).parse(data ?? []);
  const hasMore = after !== null && rows.length > CHAT_PAGE_LIMIT;
  const messages = rows.slice(0, after === null ? rows.length : CHAT_PAGE_LIMIT).map((row) => ({
    id: row.o_id,
    nickname: row.o_nickname,
    body: row.o_body,
    isAdmin: row.o_is_admin,
  }));
  return { messages, hasMore };
}
