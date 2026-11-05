import { z } from "zod";
import { normalizeName } from "../normalize-name";
import { roomCodeSchema } from "./rooms";

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;

// Letters (A-Z plus Spanish accents), digits, space, dot, dash and underscore.
// Deliberately limited to characters that normalizeName() (TypeScript) and
// public.normalize_name() (database) treat identically, so both always agree on duplicates.
const NICKNAME_PATTERN = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ _.-]+$/;

/** Trims, collapses repeated spaces, then validates. "  Ana   Luz " -> "Ana Luz". */
export const nicknameSchema = z
  .string()
  .max(100)
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(NICKNAME_MIN_LENGTH)
      .max(NICKNAME_MAX_LENGTH)
      .regex(NICKNAME_PATTERN)
      // At least 2 letters or digits, because the duplicate check ignores everything else.
      .refine((value) => normalizeName(value).length >= NICKNAME_MIN_LENGTH),
  );

export const joinRoomInputSchema = z.object({ roomCode: roomCodeSchema, nickname: nicknameSchema });

export type JoinRoomInput = z.infer<typeof joinRoomInputSchema>;
