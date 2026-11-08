import { z } from "zod";
import { roomCodeSchema } from "./rooms";

export const submitAttemptInputSchema = z.object({
  roomCode: roomCodeSchema,
  // pokemon.id runs 1..1082; the database is the real judge (unknown ids are rejected there).
  pokemonId: z.number().int().min(1).max(100000),
  // true = "send it anyway" after the repeat warning
  confirmRepeat: z.boolean().optional(),
});

export type SubmitAttemptInput = z.infer<typeof submitAttemptInputSchema>;

const feedQuerySchema = z.object({
  after: z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number)
    .optional(),
  chatAfter: z
    .string()
    .regex(/^\d{1,15}$/)
    .transform(Number)
    .optional(),
  players: z.enum(["0", "1"]).optional(),
});

/**
 * Reads ?after=<attempt id>&chatAfter=<chat id>&players=1. players=1 asks for the "full" refresh:
 * nickname list and the hints table. Returns null when something is malformed.
 */
export function parseFeedQuery(
  params: URLSearchParams,
): { after: number | null; chatAfter: number | null; full: boolean } | null {
  const parsed = feedQuerySchema.safeParse({
    after: params.get("after") ?? undefined,
    chatAfter: params.get("chatAfter") ?? undefined,
    players: params.get("players") ?? undefined,
  });
  if (!parsed.success) return null;
  return { after: parsed.data.after ?? null, chatAfter: parsed.data.chatAfter ?? null, full: parsed.data.players === "1" };
}
