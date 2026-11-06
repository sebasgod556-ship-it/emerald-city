import { z } from "zod";
import { normalizeCode } from "../room-codes";

export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
export const ADMIN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{12}$/;

export const roomCodeSchema = z.string().max(100).transform(normalizeCode).pipe(z.string().regex(ROOM_CODE_PATTERN));
export const adminCodeSchema = z.string().max(100).transform(normalizeCode).pipe(z.string().regex(ADMIN_CODE_PATTERN));

export const createRoomInputSchema = z.object({ pokemonId: z.number().int().positive() });
export const loginAdminInputSchema = z.object({ roomCode: roomCodeSchema, adminCode: adminCodeSchema });

export const closeRoomInputSchema = z.object({ roomCode: roomCodeSchema });

export type CreateRoomInput = z.infer<typeof createRoomInputSchema>;
export type LoginAdminInput = z.infer<typeof loginAdminInputSchema>;
