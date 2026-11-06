import type { FeedAttempt, FeedSnapshot, HintResult } from "./feed-types";

// Hand-written on purpose (no Zod) so the browser bundle stays small. Returns null for anything unexpected.
const RESULTS: readonly string[] = ["fire", "warm", "cold"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAttempt(item: unknown): FeedAttempt | null {
  if (!isRecord(item)) return null;
  const { id, nickname, pokemon, result, isWinner } = item;
  if (typeof id !== "number" || !Number.isInteger(id)) return null;
  if (typeof nickname !== "string" || typeof pokemon !== "string") return null;
  if (typeof result !== "string" || !RESULTS.includes(result)) return null;
  if (typeof isWinner !== "boolean") return null;
  return { id, nickname, pokemon, result: result as HintResult, isWinner };
}

/** Parses the body of GET /api/rooms/[roomCode]/feed ({ data, error }). */
export function parseFeed(body: unknown): FeedSnapshot | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const { status, attempts, cursor, hasMore, players } = body.data;
  if (status !== "playing" && status !== "finished") return null;
  if (!Array.isArray(attempts)) return null;
  if (typeof cursor !== "number" || typeof hasMore !== "boolean") return null;

  const parsed: FeedAttempt[] = [];
  for (const item of attempts as unknown[]) {
    const attempt = parseAttempt(item);
    if (attempt === null) return null;
    parsed.push(attempt);
  }

  let nicknames: string[] | null = null;
  if (players !== null && players !== undefined) {
    if (!Array.isArray(players) || !(players as unknown[]).every((p) => typeof p === "string")) return null;
    nicknames = players as string[];
  }
  return { status, attempts: parsed, cursor, hasMore, players: nicknames };
}

/** Parses GET /api/pokemon/names. */
export function parseNames(body: unknown): { id: number; nombre_es: string; search_key: string }[] | null {
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.names)) return null;
  const out: { id: number; nombre_es: string; search_key: string }[] = [];
  for (const item of body.data.names as unknown[]) {
    if (!isRecord(item)) return null;
    const { id, nombre_es, search_key } = item;
    if (typeof id !== "number" || typeof nombre_es !== "string" || typeof search_key !== "string") return null;
    out.push({ id, nombre_es, search_key });
  }
  return out;
}
