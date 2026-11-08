import { z } from "zod";
import { roomCodeSchema } from "./rooms";

export const CHAT_MAX_LENGTH = 200;

// Control characters and line breaks become spaces, runs of spaces collapse, edges are trimmed.
// The database re-checks length and control characters (chat_messages_body_valid).
export const chatBodySchema = z
  .string()
  .max(2000)
  .transform((value) => value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1).max(CHAT_MAX_LENGTH));

export const sendChatInputSchema = z.object({ roomCode: roomCodeSchema, body: chatBodySchema });

export type SendChatInput = z.infer<typeof sendChatInputSchema>;
