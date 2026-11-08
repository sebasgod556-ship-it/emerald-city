import type { ChatMessage, FeedAttempt, FeedSnapshot, HintEntry, HintResult } from "./feed-types";

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

function parseChat(item: unknown): ChatMessage | null {
  if (!isRecord(item)) return null;
  const { id, nickname, body, isAdmin } = item;
  if (typeof id !== "number" || !Number.isInteger(id)) return null;
  if (typeof nickname !== "string" || typeof body !== "string" || typeof isAdmin !== "boolean") return null;
  return { id, nickname, body, isAdmin };
}

function parseHint(item: unknown): HintEntry | null {
  if (!isRecord(item)) return null;
  const { pokemon, result } = item;
  if (typeof pokemon !== "string" || (result !== "fire" && result !== "warm")) return null;
  return { pokemon, result };
}

/** Parses the body of GET /api/rooms/[roomCode]/feed ({ data, error }). */
export function parseFeed(body: unknown): FeedSnapshot | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const { status, attempts, cursor, hasMore, players, chat, chatCursor, hints, cooldownSeconds, startDeadlineAt, serverNow } =
    body.data;
  if (status !== "waiting" && status !== "playing" && status !== "finished") return null;
  // Tolerant on purpose: a phone that loaded the old page can read an answer from the new server and the other way round.
  if (cooldownSeconds !== undefined && typeof cooldownSeconds !== "number") return null;
  if (startDeadlineAt !== undefined && startDeadlineAt !== null && typeof startDeadlineAt !== "string") return null;
  if (serverNow !== undefined && serverNow !== null && typeof serverNow !== "string") return null;
  if (!Array.isArray(attempts)) return null;
  if (typeof cursor !== "number" || typeof hasMore !== "boolean") return null;
  if (!Array.isArray(chat) || typeof chatCursor !== "number") return null;

  const parsed: FeedAttempt[] = [];
  for (const item of attempts as unknown[]) {
    const attempt = parseAttempt(item);
    if (attempt === null) return null;
    parsed.push(attempt);
  }

  const messages: ChatMessage[] = [];
  for (const item of chat as unknown[]) {
    const message = parseChat(item);
    if (message === null) return null;
    messages.push(message);
  }

  let hintList: HintEntry[] | null = null;
  if (hints !== null && hints !== undefined) {
    if (!Array.isArray(hints)) return null;
    hintList = [];
    for (const item of hints as unknown[]) {
      const hint = parseHint(item);
      if (hint === null) return null;
      hintList.push(hint);
    }
  }

  let nicknames: string[] | null = null;
  if (players !== null && players !== undefined) {
    if (!Array.isArray(players) || !(players as unknown[]).every((p) => typeof p === "string")) return null;
    nicknames = players as string[];
  }
  return {
    status,
    cooldownSeconds: cooldownSeconds ?? 1,
    startDeadlineAt: (startDeadlineAt as string | null | undefined) ?? null,
    serverNow: (serverNow as string | null | undefined) ?? null,
    attempts: parsed,
    cursor,
    chat: messages,
    chatCursor,
    hasMore,
    hints: hintList,
    players: nicknames,
  };
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
