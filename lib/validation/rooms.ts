import { z } from "zod";
import { normalizeCode } from "../room-codes";

export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const ADMIN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{12}$/;

// Wait between two attempts of the same player (free mode), chosen by the admin. Also enforced by a table constraint.
export const MIN_COOLDOWN_SECONDS = 1;
export const MAX_COOLDOWN_SECONDS = 120;
export const DEFAULT_COOLDOWN_SECONDS = 3;
// Minutes the waiting room lasts before the game starts by itself. 0 = no waiting room (the room starts playing).
export const MIN_WAIT_MINUTES = 0;
export const MAX_WAIT_MINUTES = 60;
export const DEFAULT_WAIT_MINUTES = 5;
// Turn mode (Mode A): seconds a player has to answer before the turn is skipped.
export const MIN_TURN_SECONDS = 5;
export const MAX_TURN_SECONDS = 120;
export const DEFAULT_TURN_SECONDS = 20;
// Automatic clues (Phase 3): one clue every N seconds, at most M of them. 0 clues = off. Also enforced by table constraints.
export const MIN_CLUE_INTERVAL_SECONDS = 15;
export const MAX_CLUE_INTERVAL_SECONDS = 300;
export const DEFAULT_CLUE_INTERVAL_SECONDS = 60;
export const MIN_CLUE_MAX = 0;
export const MAX_CLUE_MAX = 5;
export const DEFAULT_CLUE_MAX = 2;
export const ROOM_MODES = ["free", "turns"] as const;
export const TURN_ORDERS = ["random", "arrival"] as const;

export const roomCodeSchema = z.string().max(100).transform(normalizeCode).pipe(z.string().regex(ROOM_CODE_PATTERN));
export const adminCodeSchema = z.string().max(100).transform(normalizeCode).pipe(z.string().regex(ADMIN_CODE_PATTERN));

export const cooldownSecondsSchema = z.number().int().min(MIN_COOLDOWN_SECONDS).max(MAX_COOLDOWN_SECONDS);
export const waitMinutesSchema = z.number().int().min(MIN_WAIT_MINUTES).max(MAX_WAIT_MINUTES);
export const turnSecondsSchema = z.number().int().min(MIN_TURN_SECONDS).max(MAX_TURN_SECONDS);

export const clueIntervalSecondsSchema = z.number().int().min(MIN_CLUE_INTERVAL_SECONDS).max(MAX_CLUE_INTERVAL_SECONDS);
export const clueMaxSchema = z.number().int().min(MIN_CLUE_MAX).max(MAX_CLUE_MAX);

export const createRoomInputSchema = z.object({
  pokemonId: z.number().int().positive(),
  cooldownSeconds: cooldownSecondsSchema.default(DEFAULT_COOLDOWN_SECONDS),
  waitMinutes: waitMinutesSchema.default(DEFAULT_WAIT_MINUTES),
  mode: z.enum(ROOM_MODES).default("free"),
  turnOrder: z.enum(TURN_ORDERS).default("random"),
  turnSeconds: turnSecondsSchema.default(DEFAULT_TURN_SECONDS),
  clueIntervalSeconds: clueIntervalSecondsSchema.default(DEFAULT_CLUE_INTERVAL_SECONDS),
  clueMax: clueMaxSchema.default(DEFAULT_CLUE_MAX),
});
export const loginAdminInputSchema = z.object({ roomCode: roomCodeSchema, adminCode: adminCodeSchema });

export const closeRoomInputSchema = z.object({ roomCode: roomCodeSchema });
export const startRoomInputSchema = z.object({ roomCode: roomCodeSchema });
// The admin names the player to kick; the database matches it with the same normalization as the nickname key.
export const kickPlayerInputSchema = z.object({
  roomCode: roomCodeSchema,
  nickname: z.string().trim().min(2).max(20),
});
// Admin powers (Phase 3). Each one needs the secret admin cookie, checked again on the server.
export const pauseRoomInputSchema = z.object({ roomCode: roomCodeSchema });
export const resumeRoomInputSchema = z.object({ roomCode: roomCodeSchema });
export const skipTurnInputSchema = z.object({ roomCode: roomCodeSchema });
export const mutePlayerInputSchema = z.object({
  roomCode: roomCodeSchema,
  nickname: z.string().trim().min(2).max(20),
  muted: z.boolean(),
});
export const updateClueSettingsInputSchema = z.object({
  roomCode: roomCodeSchema,
  intervalSeconds: clueIntervalSecondsSchema,
  max: clueMaxSchema,
});
export const resetRoomInputSchema = z.object({ roomCode: roomCodeSchema, pokemonId: z.number().int().positive() });
export const updateCooldownInputSchema = z.object({ roomCode: roomCodeSchema, seconds: cooldownSecondsSchema });

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type LoginAdminInput = z.infer<typeof loginAdminInputSchema>;
